import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { GetSellersParams } from "../generated/schemas";

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

const ROUTE = `/seller`;

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
  data: z.array(sellerSchema),
});

describe("GET /seller", () => {
  describe("성공", () => {
    it("GS | 200 | 성공 | 판매자 목록 조회 성공 (페이지 파라미터 없음)", async () => {
      // given
      const params: GetSellersParams = {
        sessionMember: {
          id: 1,
          email: "admin@example.com",
          authority: "ADMIN_MEMBER",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "판매자 목록 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: [
          {
            id: 1,
            memberId: 2,
            businessNumber: "123-45-67890",
            businessName: "테스트 쇼핑몰",
          },
          {
            id: 2,
            memberId: 3,
            businessNumber: "987-65-43210",
            businessName: "샘플 스토어",
          },
        ],
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getSellers(params);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]?.params?.sessionMember).toEqual(params.sessionMember);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(Array.isArray(validatedData.data)).toBe(true);
      validatedData.data.forEach((seller) => {
        if (seller.id !== undefined) {
          expect(seller.id).toBeTypeOf("number");
        }
        if (seller.businessName !== undefined) {
          expect(seller.businessName).toBeTypeOf("string");
        }
      });
    });

    it("GS | 200 | 성공 | 판매자 목록 조회 성공 (페이지 파라미터 포함)", async () => {
      // given
      const params: GetSellersParams = {
        sessionMember: {
          id: 1,
          email: "admin@example.com",
          authority: "ADMIN_MEMBER",
        },
        page: 1,
      };
      const successResponse = {
        status: "SUCCESS",
        message: "판매자 목록 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: [
          {
            id: 1,
            memberId: 2,
            businessNumber: "123-45-67890",
            businessName: "테스트 쇼핑몰",
          },
        ],
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getSellers(params);

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
    it("GS | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const params: GetSellersParams = {
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
      await expect(api.getSellers(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GS | 403 | 실패 | 권한 부족", async () => {
      // given
      const params: GetSellersParams = {
        sessionMember: {
          id: 1,
          email: "user@example.com",
          authority: "GENERAL_MEMBER",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "판매자 목록 조회 권한이 없습니다",
        errorCode: "FORBIDDEN",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 403, errorResponse);

      // when & then
      await expect(api.getSellers(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GS | 400 | 실패 | 잘못된 페이지 번호", async () => {
      // given
      const params: GetSellersParams = {
        sessionMember: {
          id: 1,
          email: "admin@example.com",
          authority: "ADMIN_MEMBER",
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
      await expect(api.getSellers(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
