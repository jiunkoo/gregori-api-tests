import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../../generated/gregori-api";
import { mockSuccess, mockError } from "../../utils/mock-helpers";
import type { AuthSignInDto } from "../../generated/schemas";

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
});

const ROUTE = `/auth/signin`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
  data: z.object({
    member: z.object({
      id: z.number(),
      email: z.string().email(),
      name: z.string(),
      authority: z.enum(["USER", "SELLER", "ADMIN"]),
      isDeleted: z.boolean(),
    }),
  }),
});

const VALIDATION_ERRORS = {
  EMAIL_REQUIRED: "email은 필수값입니다",
  EMAIL_INVALID: "email은 유효한 이메일 형식이어야 합니다",
  PASSWORD_REQUIRED: "password는 필수값입니다",
  PASSWORD_INVALID:
    "password는 최소 2개의 알파벳, 1개의 숫자, 1개의 특수문자를 포함한 8-15자여야 합니다",
} as const;

const validateSignInRequest = (payload: {
  email?: string;
  password?: string;
}): void => {
  if (!payload.email) {
    throw new Error(VALIDATION_ERRORS.EMAIL_REQUIRED);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(payload.email)) {
    throw new Error(VALIDATION_ERRORS.EMAIL_INVALID);
  }

  if (!payload.password) {
    throw new Error(VALIDATION_ERRORS.PASSWORD_REQUIRED);
  }
  const passwordRegex =
    /^(?=(.*[a-zA-Z].*){2,})(?=.*\d.*)(?=.*\W.*)[a-zA-Z0-9\S]{8,15}$/;
  if (!passwordRegex.test(payload.password)) {
    throw new Error(VALIDATION_ERRORS.PASSWORD_INVALID);
  }
};

describe("POST /auth/signin", () => {
  describe("검증", () => {
    it.each([
      {
        field: "email",
        payload: {
          password: "Abc123!@",
        },
      },
      {
        field: "password",
        payload: {
          email: "test@example.com",
        },
      },
    ])("SI | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      // when & then
      expect(() => validateSignInRequest(payload)).toThrow();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("SI | PRE | 검증 | 이메일 형식 오류 — 요청 차단", () => {
      // given
      const payload = {
        email: "invalid-email",
        password: "Abc123!@",
      };

      // when & then
      expect(() => validateSignInRequest(payload)).toThrow(
        VALIDATION_ERRORS.EMAIL_INVALID
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it.each([
      {
        description: "알파벳 부족 (1개만)",
        password: "A123!@#$",
      },
      {
        description: "숫자 부족",
        password: "Abcdef!@",
      },
      {
        description: "특수문자 부족",
        password: "Abc123def",
      },
      {
        description: "길이 부족 (7자)",
        password: "Ab1!def",
      },
      {
        description: "길이 초과 (16자)",
        password: "Abc123!@defghijk",
      },
    ])(
      "SI | PRE | 검증 | 비밀번호 형식 오류 ($description) — 요청 차단",
      ({ password }) => {
        // given
        const payload = {
          email: "test@example.com",
          password,
        };

        // when & then
        expect(() => validateSignInRequest(payload)).toThrow(
          VALIDATION_ERRORS.PASSWORD_INVALID
        );
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );
  });

  describe("성공", () => {
    it("SI | 200 | 성공 | 로그인 성공 — 세션 생성", async () => {
      // given
      const payload: AuthSignInDto = {
        email: "test@example.com",
        password: "Abc123!@",
      };
      const successResponse = {
        status: "SUCCESS",
        message: "로그인이 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: {
          member: {
            id: 1,
            email: "test@example.com",
            name: "테스트 사용자",
            authority: "USER" as const,
            isDeleted: false,
          },
        },
      };
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateSignInRequest(payload)).not.toThrow();
      const response = await api.signIn(payload);

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
      expect(validatedData.data.member.id).toBeTypeOf("number");
      expect(validatedData.data.member.email).toBe(payload.email);
      expect(validatedData.data.member.name).toBeTypeOf("string");
      expect(["USER", "SELLER", "ADMIN"]).toContain(
        validatedData.data.member.authority
      );
      expect(validatedData.data.member.isDeleted).toBeTypeOf("boolean");
    });
  });

  describe("실패", () => {
    it("SI | 401 | 실패 | 잘못된 이메일 또는 비밀번호", async () => {
      // given
      const payload: AuthSignInDto = {
        email: "wrong@example.com",
        password: "Abc123!@",
      };
      const errorResponse = {
        status: "ERROR",
        message: "이메일 또는 비밀번호가 올바르지 않습니다",
        errorCode: "INVALID_CREDENTIALS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 401, errorResponse);

      // when & then
      await expect(api.signIn(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        ROUTE,
        payload,
        expect.anything()
      );
    });

    it("SI | 400 | 실패 | Content-Type 오류", async () => {
      // given
      const invalidBody = "email=test@example.com&password=Abc123!@";
      const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
      const errorResponse = {
        status: "ERROR",
        message: "잘못된 요청 형식입니다",
        errorCode: "INVALID_REQUEST",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(
        mockedAxios.post(ROUTE, invalidBody, {
          headers,
        })
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("SI | 400 | 실패 | 이메일 형식 오류", async () => {
      // given
      const payload: AuthSignInDto = {
        email: "invalid-email",
        password: "Abc123!@",
      };
      const errorResponse = {
        status: "ERROR",
        message: "이메일 형식이 올바르지 않습니다",
        errorCode: "INVALID_EMAIL_FORMAT",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.signIn(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("SI | 400 | 실패 | 비밀번호 형식 오류", async () => {
      // given
      const payload: AuthSignInDto = {
        email: "test@example.com",
        password: "short",
      };
      const errorResponse = {
        status: "ERROR",
        message: "비밀번호 형식이 올바르지 않습니다",
        errorCode: "INVALID_PASSWORD_FORMAT",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.signIn(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
