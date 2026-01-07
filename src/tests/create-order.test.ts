import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { OrderRequestDto } from "../generated/schemas";

const baseURL = process.env.API_URL;

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

let api: ReturnType<typeof getGregoriApi>;

beforeAll(() => {
  if (!baseURL) {
    throw new Error("환경 변수 API_URL이 설정되어 있어야 합니다.");
  }
  api = getGregoriApi();
});

beforeEach(() => {
  vi.clearAllMocks();
  setSessionCookie("sessionid=test-session-123");
});

const ROUTE = `/order`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

const VALIDATION_ERRORS = {
  MEMBER_ID_REQUIRED: "memberId는 필수값입니다",
  PAYMENT_METHOD_REQUIRED: "paymentMethod는 필수값입니다",
  PAYMENT_AMOUNT_REQUIRED: "paymentAmount는 필수값입니다",
  DELIVERY_COST_REQUIRED: "deliveryCost는 필수값입니다",
  ORDER_DETAILS_REQUIRED: "orderDetails는 필수값입니다",
  ORDER_DETAILS_EMPTY: "orderDetails는 최소 1개 이상이어야 합니다",
  PAYMENT_AMOUNT_INVALID: "paymentAmount는 0보다 커야 합니다",
  DELIVERY_COST_INVALID: "deliveryCost는 0 이상이어야 합니다",
} as const;

const validateCreateOrderRequest = (payload: {
  memberId?: number;
  paymentMethod?: string;
  paymentAmount?: number;
  deliveryCost?: number;
  orderDetails?: Array<{ productId?: number; productCount?: number }>;
}): void => {
  if (payload.memberId === undefined || payload.memberId === null) {
    throw new Error(VALIDATION_ERRORS.MEMBER_ID_REQUIRED);
  }
  if (!payload.paymentMethod) {
    throw new Error(VALIDATION_ERRORS.PAYMENT_METHOD_REQUIRED);
  }
  if (payload.paymentAmount === undefined || payload.paymentAmount === null) {
    throw new Error(VALIDATION_ERRORS.PAYMENT_AMOUNT_REQUIRED);
  }
  if (payload.paymentAmount <= 0) {
    throw new Error(VALIDATION_ERRORS.PAYMENT_AMOUNT_INVALID);
  }
  if (payload.deliveryCost === undefined || payload.deliveryCost === null) {
    throw new Error(VALIDATION_ERRORS.DELIVERY_COST_REQUIRED);
  }
  if (payload.deliveryCost < 0) {
    throw new Error(VALIDATION_ERRORS.DELIVERY_COST_INVALID);
  }
  if (!payload.orderDetails) {
    throw new Error(VALIDATION_ERRORS.ORDER_DETAILS_REQUIRED);
  }
  if (payload.orderDetails.length === 0) {
    throw new Error(VALIDATION_ERRORS.ORDER_DETAILS_EMPTY);
  }
};

describe("POST /order", () => {
  describe("검증", () => {
    it.each([
      {
        field: "memberId",
        payload: {
          paymentMethod: "CARD",
          paymentAmount: 50000,
          deliveryCost: 3000,
          orderDetails: [{ productId: 1, productCount: 2 }],
        },
      },
      {
        field: "paymentMethod",
        payload: {
          memberId: 1,
          paymentAmount: 50000,
          deliveryCost: 3000,
          orderDetails: [{ productId: 1, productCount: 2 }],
        },
      },
      {
        field: "paymentAmount",
        payload: {
          memberId: 1,
          paymentMethod: "CARD",
          deliveryCost: 3000,
          orderDetails: [{ productId: 1, productCount: 2 }],
        },
      },
      {
        field: "deliveryCost",
        payload: {
          memberId: 1,
          paymentMethod: "CARD",
          paymentAmount: 50000,
          orderDetails: [{ productId: 1, productCount: 2 }],
        },
      },
      {
        field: "orderDetails",
        payload: {
          memberId: 1,
          paymentMethod: "CARD",
          paymentAmount: 50000,
          deliveryCost: 3000,
        },
      },
    ])("CO | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      // when & then
      expect(() => validateCreateOrderRequest(payload as any)).toThrow();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("CO | PRE | 검증 | paymentAmount가 0 이하 — 요청 차단", () => {
      // given
      const payload = {
        memberId: 1,
        paymentMethod: "CARD",
        paymentAmount: 0,
        deliveryCost: 3000,
        orderDetails: [{ productId: 1, productCount: 2 }],
      };

      // when & then
      expect(() => validateCreateOrderRequest(payload)).toThrow(
        VALIDATION_ERRORS.PAYMENT_AMOUNT_INVALID
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("CO | PRE | 검증 | deliveryCost가 음수 — 요청 차단", () => {
      // given
      const payload = {
        memberId: 1,
        paymentMethod: "CARD",
        paymentAmount: 50000,
        deliveryCost: -1000,
        orderDetails: [{ productId: 1, productCount: 2 }],
      };

      // when & then
      expect(() => validateCreateOrderRequest(payload)).toThrow(
        VALIDATION_ERRORS.DELIVERY_COST_INVALID
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("CO | PRE | 검증 | orderDetails가 빈 배열 — 요청 차단", () => {
      // given
      const payload = {
        memberId: 1,
        paymentMethod: "CARD",
        paymentAmount: 50000,
        deliveryCost: 3000,
        orderDetails: [],
      };

      // when & then
      expect(() => validateCreateOrderRequest(payload)).toThrow(
        VALIDATION_ERRORS.ORDER_DETAILS_EMPTY
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("성공", () => {
    it("CO | 200 | 성공 | 주문 생성 성공", async () => {
      // given
      const payload: OrderRequestDto = {
        memberId: 1,
        paymentMethod: "CARD",
        paymentAmount: 50000,
        deliveryCost: 3000,
        orderDetails: [
          {
            productId: 1,
            productCount: 2,
          },
        ],
      };
      const successResponse = {
        status: "SUCCESS",
        message: "주문이 생성되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateCreateOrderRequest(payload)).not.toThrow();
      const response = await api.createOrder(payload);

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        ROUTE,
        payload,
        expect.anything()
      );
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.status).toBe("SUCCESS");
      expect(validatedData.message).toBeTypeOf("string");
    });
  });

  describe("실패", () => {
    it("CO | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const payload: OrderRequestDto = {
        memberId: 1,
        paymentMethod: "CARD",
        paymentAmount: 50000,
        deliveryCost: 3000,
        orderDetails: [
          {
            productId: 1,
            productCount: 2,
          },
        ],
      };
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 401, errorResponse);

      // when & then
      await expect(api.createOrder(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("CO | 400 | 실패 | 존재하지 않는 상품", async () => {
      // given
      const payload: OrderRequestDto = {
        memberId: 1,
        paymentMethod: "CARD",
        paymentAmount: 50000,
        deliveryCost: 3000,
        orderDetails: [
          {
            productId: 999,
            productCount: 2,
          },
        ],
      };
      const errorResponse = {
        status: "ERROR",
        message: "존재하지 않는 상품입니다",
        errorCode: "PRODUCT_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.createOrder(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("CO | 400 | 실패 | 재고 부족", async () => {
      // given
      const payload: OrderRequestDto = {
        memberId: 1,
        paymentMethod: "CARD",
        paymentAmount: 50000,
        deliveryCost: 3000,
        orderDetails: [
          {
            productId: 1,
            productCount: 1000,
          },
        ],
      };
      const errorResponse = {
        status: "ERROR",
        message: "재고가 부족합니다",
        errorCode: "INSUFFICIENT_STOCK",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.createOrder(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
