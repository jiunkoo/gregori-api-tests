import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { UpdateSellerBody } from "../generated/schemas";

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
  ID_REQUIRED: "id는 필수값입니다",
  BUSINESS_NUMBER_REQUIRED: "businessNumber는 필수값입니다",
  BUSINESS_NAME_REQUIRED: "businessName은 필수값입니다",
  BUSINESS_NUMBER_INVALID:
    "businessNumber는 올바른 사업자등록번호 형식이어야 합니다",
} as const;

const validateUpdateSellerRequest = (payload: {
  dto?: { id?: number; businessNumber?: string; businessName?: string };
}): void => {
  if (!payload.dto?.id) {
    throw new Error(VALIDATION_ERRORS.ID_REQUIRED);
  }
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

describe("PATCH /seller", () => {
  describe("검증", () => {
    it.each([
      {
        field: "id",
        payload: {
          dto: {
            businessNumber: "123-45-67890",
            businessName: "테스트 쇼핑몰",
          },
        },
      },
      {
        field: "businessNumber",
        payload: {
          dto: {
            id: 1,
            businessName: "테스트 쇼핑몰",
          },
        },
      },
      {
        field: "businessName",
        payload: {
          dto: {
            id: 1,
            businessNumber: "123-45-67890",
          },
        },
      },
    ])("US | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      // when & then
      expect(() => validateUpdateSellerRequest(payload as any)).toThrow();
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });

    it("US | PRE | 검증 | 사업자등록번호 형식 오류 — 요청 차단", () => {
      // given
      const payload = {
        dto: {
          id: 1,
          businessNumber: "1234567890",
          businessName: "테스트 쇼핑몰",
        },
      };

      // when & then
      expect(() => validateUpdateSellerRequest(payload)).toThrow(
        VALIDATION_ERRORS.BUSINESS_NUMBER_INVALID
      );
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });
  });

  describe("성공", () => {
    it("US | 200 | 성공 | 판매자 정보 수정 성공", async () => {
      // given
      const payload: UpdateSellerBody = {
        sessionMember: {
          id: 1,
          email: "seller@example.com",
          authority: "SELLING_MEMBER",
        },
        dto: {
          id: 1,
          businessNumber: "987-65-43210",
          businessName: "수정된 쇼핑몰",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "판매자 정보가 수정되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.patch, successResponse);

      // when
      expect(() => validateUpdateSellerRequest(payload)).not.toThrow();

      const response = await api.updateSeller(payload);

      // then
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
      expect(mockedAxios.patch).toHaveBeenCalledWith(
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
    it("US | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const payload: UpdateSellerBody = {
        sessionMember: {
          id: 1,
          email: "seller@example.com",
          authority: "SELLING_MEMBER",
        },
        dto: {
          id: 1,
          businessNumber: "987-65-43210",
          businessName: "수정된 쇼핑몰",
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
      await expect(api.updateSeller(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("US | 404 | 실패 | 존재하지 않는 판매자", async () => {
      // given
      const payload: UpdateSellerBody = {
        sessionMember: {
          id: 1,
          email: "seller@example.com",
          authority: "SELLING_MEMBER",
        },
        dto: {
          id: 999,
          businessNumber: "987-65-43210",
          businessName: "수정된 쇼핑몰",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "판매자를 찾을 수 없습니다",
        errorCode: "SELLER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 404, errorResponse);

      // when & then
      await expect(api.updateSeller(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("US | 409 | 실패 | 이미 존재하는 사업자등록번호", async () => {
      // given
      const payload: UpdateSellerBody = {
        sessionMember: {
          id: 1,
          email: "seller@example.com",
          authority: "SELLING_MEMBER",
        },
        dto: {
          id: 1,
          businessNumber: "123-45-67890",
          businessName: "수정된 쇼핑몰",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "이미 존재하는 사업자등록번호입니다",
        errorCode: "BUSINESS_NUMBER_ALREADY_EXISTS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 409, errorResponse);

      // when & then
      await expect(api.updateSeller(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });

    it("US | 403 | 실패 | 권한 부족", async () => {
      // given
      const payload: UpdateSellerBody = {
        sessionMember: {
          id: 1,
          email: "user@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          id: 1,
          businessNumber: "987-65-43210",
          businessName: "수정된 쇼핑몰",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "판매자 정보 수정 권한이 없습니다",
        errorCode: "FORBIDDEN",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.patch, 403, errorResponse);

      // when & then
      await expect(api.updateSeller(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });
  });
});
