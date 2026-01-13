import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../../generated/gregori-api";
import { mockSuccess, mockError } from "../../utils/mock-helpers";
import { setSessionCookie } from "../../utils/axios-cookie-auth";
import type { GetOrdersParams } from "../../generated/schemas";

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

const orderDetailSchema = z.object({
  id: z.number().optional(),
  menuId: z.number().optional(),
  quantity: z.number().optional(),
  price: z.number().optional(),
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
  data: z.array(orderSchema),
});

describe("GET /order", () => {
  describe("성공", () => {
    it("GO | 200 | 성공 | 주문 목록 조회 성공 (페이지 파라미터 없음)", async () => {
      // given
      const params: GetOrdersParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "주문 목록 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: [
          {
            id: 1,
            memberId: 1,
            orderNumber: "ORD-2025-001",
            paymentMethod: "CARD",
            paymentAmount: 50000,
            deliveryCost: 3000,
            status: "PENDING",
            createdAt: "2025-08-07T10:00:00.000Z",
            updatedAt: "2025-08-07T10:00:00.000Z",
            orderDetails: [
              {
                id: 1,
                menuId: 1,
                quantity: 2,
                price: 25000,
                status: "PENDING",
              },
            ],
          },
        ],
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getOrders(params);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]?.params?.sessionMember).toEqual(params.sessionMember);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(Array.isArray(validatedData.data)).toBe(true);
      validatedData.data.forEach((order) => {
        if (order.id !== undefined) {
          expect(order.id).toBeTypeOf("number");
        }
        if (order.orderNumber !== undefined) {
          expect(order.orderNumber).toBeTypeOf("string");
        }
      });
    });

    it("GO | 200 | 성공 | 주문 목록 조회 성공 (페이지 파라미터 포함)", async () => {
      // given
      const params: GetOrdersParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        page: 1,
      };
      const successResponse = {
        status: "SUCCESS",
        message: "주문 목록 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: [
          {
            id: 1,
            memberId: 1,
            orderNumber: "ORD-2025-001",
            paymentMethod: "CARD",
            paymentAmount: 50000,
            deliveryCost: 3000,
            status: "PENDING",
            createdAt: "2025-08-07T10:00:00.000Z",
            updatedAt: "2025-08-07T10:00:00.000Z",
          },
        ],
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getOrders(params);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]?.params?.sessionMember).toEqual(params.sessionMember);
      expect(callArgs[1]?.params?.page).toBe(params.page);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);
    });
  });

  describe("실패", () => {
    it("GO | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const params: GetOrdersParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 401, errorResponse);

      // when & then
      await expect(api.getOrders(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GO | 400 | 실패 | 잘못된 페이지 번호", async () => {
      // given
      const params: GetOrdersParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        page: -1,
      };
      const errorResponse = {
        status: "ERROR",
        message: "잘못된 페이지 번호입니다",
        errorCode: "INVALID_PAGE",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 400, errorResponse);

      // when & then
      await expect(api.getOrders(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
