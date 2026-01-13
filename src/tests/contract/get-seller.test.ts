import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../../generated/gregori-api";
import { mockSuccess, mockError } from "../../utils/mock-helpers";
import { setSessionCookie } from "../../utils/axios-cookie-auth";
import type { GetSellerParams } from "../../generated/schemas";

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

const sellerSchema = z.object({
  id: z.number().optional(),
  memberId: z.number().optional(),
  businessNumber: z.string().optional(),
  businessName: z.string().optional(),
});

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
  data: sellerSchema,
});

describe("GET /seller/{sellerId}", () => {
  describe("성공", () => {
    it("GSE | 200 | 성공 | 판매자 상세 조회 성공", async () => {
      // given
      const sellerId = 1;
      const ROUTE = `/seller/${sellerId}`;
      const params: GetSellerParams = {
        sessionMember: {
          id: 1,
          email: "admin@example.com",
          authority: "ADMIN_MEMBER",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "판매자 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: {
          id: 1,
          memberId: 2,
          businessNumber: "123-45-67890",
          businessName: "테스트 쇼핑몰",
        },
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getSeller(sellerId, params);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]?.params?.sessionMember).toEqual(params.sessionMember);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.data.id).toBe(sellerId);
      if (validatedData.data.businessName) {
        expect(validatedData.data.businessName).toBeTypeOf("string");
      }
    });
  });

  describe("실패", () => {
    it("GSE | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const sellerId = 1;
      const params: GetSellerParams = {
        sessionMember: {
          id: 1,
          email: "admin@example.com",
          authority: "ADMIN_MEMBER",
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
      await expect(api.getSeller(sellerId, params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GSE | 404 | 실패 | 존재하지 않는 판매자", async () => {
      // given
      const sellerId = 999;
      const params: GetSellerParams = {
        sessionMember: {
          id: 1,
          email: "admin@example.com",
          authority: "ADMIN_MEMBER",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "판매자를 찾을 수 없습니다",
        errorCode: "SELLER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 404, errorResponse);

      // when & then
      await expect(api.getSeller(sellerId, params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GSE | 403 | 실패 | 권한 부족", async () => {
      // given
      const sellerId = 1;
      const params: GetSellerParams = {
        sessionMember: {
          id: 1,
          email: "user@example.com",
          authority: "GENERAL_MEMBER",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "판매자 조회 권한이 없습니다",
        errorCode: "FORBIDDEN",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 403, errorResponse);

      // when & then
      await expect(api.getSeller(sellerId, params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
