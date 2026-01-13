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

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

describe("PATCH /order/{orderId}", () => {
  describe("성공", () => {
    it("CAO | 200 | 성공 | 주문 취소 성공", async () => {
      // given
      const orderId = 1;
      const ROUTE = `/order/${orderId}`;
      const successResponse = {
        status: "SUCCESS",
        message: "주문이 취소되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.patch, successResponse);

      // when
      const response = await api.cancelOrder(orderId);

      // then
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.patch.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.status).toBe("SUCCESS");
      expect(validatedData.message).toBeTypeOf("string");
    });
  });

  describe("실패", () => {
    it("CAO | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const orderId = 1;
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 401, errorResponse);

      // when & then
      await expect(api.cancelOrder(orderId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("CAO | 404 | 실패 | 존재하지 않는 주문", async () => {
      // given
      const orderId = 999;
      const errorResponse = {
        status: "ERROR",
        message: "주문을 찾을 수 없습니다",
        errorCode: "ORDER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 404, errorResponse);

      // when & then
      await expect(api.cancelOrder(orderId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("CAO | 409 | 실패 | 취소할 수 없는 주문 상태", async () => {
      // given
      const orderId = 1;
      const errorResponse = {
        status: "ERROR",
        message: "이미 배송 중이거나 완료된 주문은 취소할 수 없습니다",
        errorCode: "ORDER_CANNOT_BE_CANCELED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 409, errorResponse);

      // when & then
      await expect(api.cancelOrder(orderId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("CAO | 403 | 실패 | 권한 부족 (다른 회원의 주문)", async () => {
      // given
      const orderId = 1;
      const errorResponse = {
        status: "ERROR",
        message: "주문 취소 권한이 없습니다",
        errorCode: "FORBIDDEN",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 403, errorResponse);

      // when & then
      await expect(api.cancelOrder(orderId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });
  });
});
