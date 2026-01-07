import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { CreateSellerBody } from "../generated/schemas";

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

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

const VALIDATION_ERRORS = {
  BUSINESS_NUMBER_REQUIRED: "businessNumber는 필수값입니다",
  BUSINESS_NAME_REQUIRED: "businessName은 필수값입니다",
  BUSINESS_NUMBER_INVALID:
    "businessNumber는 올바른 사업자등록번호 형식이어야 합니다",
} as const;

const validateCreateSellerRequest = (payload: {
  dto?: { businessNumber?: string; businessName?: string };
}): void => {
  if (!payload.dto?.businessNumber) {
    throw new Error(VALIDATION_ERRORS.BUSINESS_NUMBER_REQUIRED);
  }
  if (!payload.dto?.businessName) {
    throw new Error(VALIDATION_ERRORS.BUSINESS_NAME_REQUIRED);
  }
  const businessNumberRegex = /^\d{3}-\d{2}-\d{5}$/;
  if (!businessNumberRegex.test(payload.dto.businessNumber)) {
    throw new Error(VALIDATION_ERRORS.BUSINESS_NUMBER_INVALID);
  }
};

describe("POST /seller", () => {
  describe("검증", () => {
    it.each([
      {
        field: "businessNumber",
        payload: {
          dto: {
            businessName: "테스트 쇼핑몰",
          },
        },
      },
      {
        field: "businessName",
        payload: {
          dto: {
            businessNumber: "123-45-67890",
          },
        },
      },
    ])("CS | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      // when & then
      expect(() => validateCreateSellerRequest(payload as any)).toThrow();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it.each([
      {
        description: "하이픈 없음",
        businessNumber: "1234567890",
      },
      {
        description: "하이픈 위치 오류",
        businessNumber: "12-345-67890",
      },
      {
        description: "길이 부족",
        businessNumber: "123-45-6789",
      },
      {
        description: "길이 초과",
        businessNumber: "123-45-678901",
      },
      {
        description: "문자 포함",
        businessNumber: "123-45-6789a",
      },
    ])(
      "CS | PRE | 검증 | 사업자등록번호 형식 오류 ($description) — 요청 차단",
      ({ businessNumber }) => {
        const payload = {
          dto: {
            businessNumber,
            businessName: "테스트 쇼핑몰",
          },
        };

        // when & then
        expect(() => validateCreateSellerRequest(payload)).toThrow(
          VALIDATION_ERRORS.BUSINESS_NUMBER_INVALID
        );
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );
  });

  describe("성공", () => {
    it("CS | 200 | 성공 | 판매자 생성 성공", async () => {
      // given
      const payload: CreateSellerBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          businessNumber: "123-45-67890",
          businessName: "테스트 쇼핑몰",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "판매자가 생성되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateCreateSellerRequest(payload)).not.toThrow();

      const response = await api.createSeller(payload);

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
    it("CS | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const payload: CreateSellerBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          businessNumber: "123-45-67890",
          businessName: "테스트 쇼핑몰",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 401, errorResponse);

      // when & then
      await expect(api.createSeller(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("CS | 409 | 실패 | 이미 존재하는 사업자등록번호", async () => {
      // given
      const payload: CreateSellerBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          businessNumber: "123-45-67890",
          businessName: "테스트 쇼핑몰",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "이미 존재하는 사업자등록번호입니다",
        errorCode: "BUSINESS_NUMBER_ALREADY_EXISTS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 409, errorResponse);

      // when & then
      await expect(api.createSeller(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("CS | 400 | 실패 | 사업자등록번호 형식 오류", async () => {
      // given
      const payload: CreateSellerBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          businessNumber: "1234567890",
          businessName: "테스트 쇼핑몰",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "사업자등록번호 형식이 올바르지 않습니다",
        errorCode: "INVALID_BUSINESS_NUMBER_FORMAT",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.createSeller(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
