import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { CategoryRequestDto } from "../generated/schemas";

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

const ROUTE = `/category`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

const VALIDATION_ERRORS = {
  NAME_REQUIRED: "name은 필수값입니다",
  NAME_INVALID: "name은 비어있을 수 없습니다",
} as const;

const validateCreateCategoryRequest = (payload: { name?: string }): void => {
  if (!payload.name) {
    throw new Error(VALIDATION_ERRORS.NAME_REQUIRED);
  }
  if (payload.name.trim().length === 0) {
    throw new Error(VALIDATION_ERRORS.NAME_INVALID);
  }
};

describe("POST /category", () => {
  describe("검증", () => {
    it("CC | PRE | 검증 | 필수값(name) 누락 — 요청 차단", () => {
      // given
      const payload = {} as CategoryRequestDto;

      // when & then
      expect(() => validateCreateCategoryRequest(payload)).toThrow(
        VALIDATION_ERRORS.NAME_REQUIRED
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("CC | PRE | 검증 | 이름이 빈 문자열 — 요청 차단", () => {
      // given
      const payload: CategoryRequestDto = {
        name: "   ",
      };

      // when & then
      expect(() => validateCreateCategoryRequest(payload)).toThrow(
        VALIDATION_ERRORS.NAME_INVALID
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("성공", () => {
    it("CC | 200 | 성공 | 카테고리 생성 성공", async () => {
      // given
      const payload: CategoryRequestDto = {
        name: "전자제품",
      };
      const successResponse = {
        status: "SUCCESS",
        message: "카테고리가 생성되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateCreateCategoryRequest(payload)).not.toThrow();
      const response = await api.createCategory(payload);

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
    it("CC | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const payload: CategoryRequestDto = {
        name: "전자제품",
      };
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 401, errorResponse);

      // when & then
      await expect(api.createCategory(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("CC | 409 | 실패 | 이미 존재하는 카테고리 이름", async () => {
      // given
      const payload: CategoryRequestDto = {
        name: "전자제품",
      };
      const errorResponse = {
        status: "ERROR",
        message: "이미 존재하는 카테고리 이름입니다",
        errorCode: "CATEGORY_NAME_ALREADY_EXISTS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 409, errorResponse);

      // when & then
      await expect(api.createCategory(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("CC | 400 | 실패 | 잘못된 요청", async () => {
      // given
      const payload: CategoryRequestDto = {
        name: "",
      };
      const errorResponse = {
        status: "ERROR",
        message: "카테고리 이름은 필수입니다",
        errorCode: "INVALID_REQUEST",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.createCategory(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
