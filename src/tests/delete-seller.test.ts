import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { SessionMember } from "../generated/schemas";

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

describe("DELETE /seller/{sellerId}", () => {
  describe("성공", () => {
    it("DS | 200 | 성공 | 판매자 삭제 성공", async () => {
      // given
      const sellerId = 1;
      const ROUTE = `/seller/${sellerId}`;
      const sessionMember: SessionMember = {
        id: 1,
        email: "admin@example.com",
        authority: "ADMIN_MEMBER",
      };
      const successResponse = {
        status: "SUCCESS",
        message: "판매자가 삭제되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.delete, successResponse);

      // when
      const response = await api.deleteSeller(sellerId, sessionMember);

      // then
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.delete.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]?.data).toEqual(sessionMember);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.status).toBe("SUCCESS");
      expect(validatedData.message).toBeTypeOf("string");
    });
  });

  describe("실패", () => {
    it("DS | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const sellerId = 1;
      const sessionMember: SessionMember = {
        id: 1,
        email: "admin@example.com",
        authority: "ADMIN_MEMBER",
      };
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 401, errorResponse);

      // when & then
      await expect(
        api.deleteSeller(sellerId, sessionMember)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DS | 404 | 실패 | 존재하지 않는 판매자", async () => {
      // given
      const sellerId = 999;
      const sessionMember: SessionMember = {
        id: 1,
        email: "admin@example.com",
        authority: "ADMIN_MEMBER",
      };
      const errorResponse = {
        status: "ERROR",
        message: "판매자를 찾을 수 없습니다",
        errorCode: "SELLER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 404, errorResponse);

      // when & then
      await expect(
        api.deleteSeller(sellerId, sessionMember)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DS | 403 | 실패 | 권한 부족", async () => {
      // given
      const sellerId = 1;
      const sessionMember: SessionMember = {
        id: 1,
        email: "user@example.com",
        authority: "GENERAL_MEMBER",
      };
      const errorResponse = {
        status: "ERROR",
        message: "판매자 삭제 권한이 없습니다",
        errorCode: "FORBIDDEN",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 403, errorResponse);

      // when & then
      await expect(
        api.deleteSeller(sellerId, sessionMember)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DS | 409 | 실패 | 진행 중인 주문이 있는 판매자", async () => {
      // given
      const sellerId = 1;
      const sessionMember: SessionMember = {
        id: 1,
        email: "admin@example.com",
        authority: "ADMIN_MEMBER",
      };
      const errorResponse = {
        status: "ERROR",
        message: "진행 중인 주문이 있어 삭제할 수 없습니다",
        errorCode: "SELLER_HAS_ACTIVE_ORDERS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 409, errorResponse);

      // when & then
      await expect(
        api.deleteSeller(sellerId, sessionMember)
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });
  });
});
