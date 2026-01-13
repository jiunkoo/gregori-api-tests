import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../../generated/gregori-api";
import { mockSuccess, mockError } from "../../utils/mock-helpers";
import { setSessionCookie } from "../../utils/axios-cookie-auth";
import type { SessionMember } from "../../generated/schemas";
import type { UpdateOrderDetailStatusParams } from "../../generated/schemas";
import { OrderDetailStatusUpdateDtoStatus } from "../../generated/schemas/orderDetailStatusUpdateDtoStatus";

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

const ROUTE = `/order/detail`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

const VALIDATION_ERRORS = {
  ORDER_DETAIL_ID_REQUIRED: "orderDetailId는 필수값입니다",
  STATUS_REQUIRED: "status는 필수값입니다",
  ORDER_DETAIL_ID_INVALID: "orderDetailId는 0보다 커야 합니다",
} as const;

const validateUpdateOrderDetailStatusRequest = (payload: {
  dto?: { orderDetailId?: number; status?: string };
}): void => {
  if (
    payload.dto?.orderDetailId === undefined ||
    payload.dto?.orderDetailId === null
  ) {
    throw new Error(VALIDATION_ERRORS.ORDER_DETAIL_ID_REQUIRED);
  }
  if (payload.dto.orderDetailId <= 0) {
    throw new Error(VALIDATION_ERRORS.ORDER_DETAIL_ID_INVALID);
  }
  if (!payload.dto?.status) {
    throw new Error(VALIDATION_ERRORS.STATUS_REQUIRED);
  }
};

describe("PATCH /order/detail", () => {
  describe("검증", () => {
    it.each([
      {
        field: "orderDetailId",
        payload: {
          dto: {
            status: OrderDetailStatusUpdateDtoStatus.SHIPMENT_PREPARATION,
          },
        },
      },
      {
        field: "status",
        payload: {
          dto: {
            orderDetailId: 1,
          },
        },
      },
    ])("UODS | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      expect(() =>
        validateUpdateOrderDetailStatusRequest(payload as any)
      ).toThrow();
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });

    it("UODS | PRE | 검증 | orderDetailId가 0 이하 — 요청 차단", () => {
      // given
      const payload = {
        dto: {
          orderDetailId: 0,
          status: OrderDetailStatusUpdateDtoStatus.SHIPMENT_PREPARATION,
        },
      };

      // when & then
      expect(() => validateUpdateOrderDetailStatusRequest(payload)).toThrow(
        VALIDATION_ERRORS.ORDER_DETAIL_ID_INVALID
      );
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });
  });

  describe("성공", () => {
    it("UODS | 200 | 성공 | 주문 상세 상태 변경 성공", async () => {
      // given
      const sessionMember: SessionMember = {
        id: 1,
        email: "seller@example.com",
        authority: "SELLING_MEMBER",
      };
      const params: UpdateOrderDetailStatusParams = {
        dto: {
          orderDetailId: 1,
          status: OrderDetailStatusUpdateDtoStatus.SHIPMENT_PREPARATION,
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "주문 상세 상태가 변경되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.patch, successResponse);

      // when
      expect(() =>
        validateUpdateOrderDetailStatusRequest(params)
      ).not.toThrow();

      const response = await api.updateOrderDetailStatus(sessionMember, params);

      // then
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.patch.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]).toEqual(sessionMember);
      expect(callArgs[2]?.params?.dto).toEqual(params.dto);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.status).toBe("SUCCESS");
      expect(validatedData.message).toBeTypeOf("string");
    });
  });

  describe("실패", () => {
    it("UODS | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const sessionMember: SessionMember = {
        id: 1,
        email: "seller@example.com",
        authority: "SELLING_MEMBER",
      };
      const params: UpdateOrderDetailStatusParams = {
        dto: {
          orderDetailId: 1,
          status: OrderDetailStatusUpdateDtoStatus.SHIPMENT_PREPARATION,
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 401, errorResponse);

      // when & then
      await expect(
        api.updateOrderDetailStatus(sessionMember, params)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("UODS | 404 | 실패 | 존재하지 않는 주문 상세", async () => {
      // given
      const sessionMember: SessionMember = {
        id: 1,
        email: "seller@example.com",
        authority: "SELLING_MEMBER",
      };
      const params: UpdateOrderDetailStatusParams = {
        dto: {
          orderDetailId: 999,
          status: OrderDetailStatusUpdateDtoStatus.SHIPMENT_PREPARATION,
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "주문 상세를 찾을 수 없습니다",
        errorCode: "ORDER_DETAIL_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 404, errorResponse);

      // when & then
      await expect(
        api.updateOrderDetailStatus(sessionMember, params)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("UODS | 403 | 실패 | 권한 부족", async () => {
      // given
      const sessionMember: SessionMember = {
        id: 1,
        email: "user@example.com",
        authority: "GENERAL_MEMBER",
      };
      const params: UpdateOrderDetailStatusParams = {
        dto: {
          orderDetailId: 1,
          status: OrderDetailStatusUpdateDtoStatus.SHIPMENT_PREPARATION,
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "주문 상세 상태 변경 권한이 없습니다",
        errorCode: "FORBIDDEN",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 403, errorResponse);

      // when & then
      await expect(
        api.updateOrderDetailStatus(sessionMember, params)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("UODS | 400 | 실패 | 잘못된 상태 값", async () => {
      // given
      const sessionMember: SessionMember = {
        id: 1,
        email: "seller@example.com",
        authority: "SELLING_MEMBER",
      };
      const params: UpdateOrderDetailStatusParams = {
        dto: {
          orderDetailId: 1,
          status: "INVALID_STATUS" as any,
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "잘못된 상태 값입니다",
        errorCode: "INVALID_STATUS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 400, errorResponse);

      // when & then
      await expect(
        api.updateOrderDetailStatus(sessionMember, params)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });
  });
});
