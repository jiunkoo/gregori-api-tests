import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../../generated/gregori-api";
import { mockSuccess, mockError } from "../../utils/mock-helpers";
import { setSessionCookie } from "../../utils/axios-cookie-auth";

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

const orderDetailSchema = z.object({
  id: z.number().optional(),
  orderId: z.number().optional(),
  productId: z.number().optional(),
  productSellerId: z.number().optional(),
  productName: z.string().optional(),
  productPrice: z.number().optional(),
  productCount: z.number().optional(),
  status: z.string().optional(),
});

const orderSchema = z.object({
  id: z.number().optional(),
  memberId: z.number().optional(),
  orderNumber: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentAmount: z.number().optional(),
  deliveryCost: z.number().optional(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  orderDetails: z.array(orderDetailSchema).optional(),
});

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
  data: orderSchema,
});

describe("GET /order/{orderId}", () => {
  describe("성공", () => {
    it("GOI | 200 | 성공 | 주문 상세 조회 성공", async () => {
      // given
      const orderId = 1;
      const ROUTE = `/order/${orderId}`;
      const successResponse = {
        status: "SUCCESS",
        message: "주문 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: {
          id: 1,
          memberId: 1,
          orderNumber: "ORD-2025-001",
          paymentMethod: "CARD",
          paymentAmount: 50000,
          deliveryCost: 3000,
          status: "ORDER_PROCESSING",
          createdAt: "2025-08-07T10:00:00.000Z",
          updatedAt: "2025-08-07T10:00:00.000Z",
          orderDetails: [
            {
              id: 1,
              orderId: 1,
              productId: 1,
              productSellerId: 1,
              productName: "테스트 상품",
              productPrice: 25000,
              productCount: 2,
              status: "PENDING",
            },
          ],
        },
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getOrder(orderId);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.data.id).toBe(orderId);
      if (validatedData.data.orderNumber) {
        expect(validatedData.data.orderNumber).toBeTypeOf("string");
      }
      if (validatedData.data.orderDetails) {
        expect(Array.isArray(validatedData.data.orderDetails)).toBe(true);
      }
    });
  });

  describe("실패", () => {
    it("GOI | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const orderId = 1;
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 401, errorResponse);

      // when & then
      await expect(api.getOrder(orderId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GOI | 404 | 실패 | 존재하지 않는 주문", async () => {
      // given
      const orderId = 999;
      const errorResponse = {
        status: "ERROR",
        message: "주문을 찾을 수 없습니다",
        errorCode: "ORDER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 404, errorResponse);

      // when & then
      await expect(api.getOrder(orderId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GOI | 403 | 실패 | 권한 부족 (다른 회원의 주문)", async () => {
      // given
      const orderId = 1;
      const errorResponse = {
        status: "ERROR",
        message: "주문 조회 권한이 없습니다",
        errorCode: "FORBIDDEN",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 403, errorResponse);

      // when & then
      await expect(api.getOrder(orderId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
