import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import type { MemberRegisterDto } from "../generated/schemas";

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

const ROUTE = `/member/register`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

const VALIDATION_ERRORS = {
  NAME_REQUIRED: "name은 필수값입니다",
  NAME_INVALID: "name은 한글 2-10자여야 합니다",
  EMAIL_REQUIRED: "email은 필수값입니다",
  EMAIL_INVALID: "email은 유효한 이메일 형식이어야 합니다",
  PASSWORD_REQUIRED: "password는 필수값입니다",
  PASSWORD_INVALID:
    "password는 최소 2개의 알파벳, 1개의 숫자, 1개의 특수문자를 포함한 8-15자여야 합니다",
} as const;

const validateRegisterRequest = (payload: {
  name?: string;
  email?: string;
  password?: string;
}): void => {
  if (!payload.name) {
    throw new Error(VALIDATION_ERRORS.NAME_REQUIRED);
  }

  const nameRegex = /^[가-힣]{2,10}$/;
  if (!nameRegex.test(payload.name)) {
    throw new Error(VALIDATION_ERRORS.NAME_INVALID);
  }

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

describe("POST /member/register", () => {
  describe("검증", () => {
    it.each([
      {
        field: "name",
        payload: {
          email: "test@example.com",
          password: "Abc123!@",
        },
      },
      {
        field: "email",
        payload: {
          name: "홍길동",
          password: "Abc123!@",
        },
      },
      {
        field: "password",
        payload: {
          name: "홍길동",
          email: "test@example.com",
        },
      },
    ])("RG | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      // when & then
      expect(() => validateRegisterRequest(payload)).toThrow();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it.each([
      {
        description: "한글 외 문자 포함",
        name: "홍길동123",
      },
      {
        description: "길이 부족 (1자)",
        name: "홍",
      },
      {
        description: "길이 초과 (11자)",
        name: "홍길동홍길동홍길동홍길",
      },
      {
        description: "영문 포함",
        name: "홍길동Hong",
      },
      {
        description: "공백 포함",
        name: "홍 길동",
      },
    ])(
      "RG | PRE | 검증 | 이름 형식 오류 ($description) — 요청 차단",
      ({ name }) => {
        // given
        const payload = {
          name,
          email: "test@example.com",
          password: "Abc123!@",
        };

        // when & then
        expect(() => validateRegisterRequest(payload)).toThrow(
          VALIDATION_ERRORS.NAME_INVALID
        );
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );

    it("RG | PRE | 검증 | 이메일 형식 오류 — 요청 차단", () => {
      // given
      const payload = {
        name: "홍길동",
        email: "invalid-email",
        password: "Abc123!@",
      };

      // when & then
      expect(() => validateRegisterRequest(payload)).toThrow(
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
      "RG | PRE | 검증 | 비밀번호 형식 오류 ($description) — 요청 차단",
      ({ password }) => {
        // given
        const payload = {
          name: "홍길동",
          email: "test@example.com",
          password,
        };

        // when & then
        expect(() => validateRegisterRequest(payload)).toThrow(
          VALIDATION_ERRORS.PASSWORD_INVALID
        );
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );
  });

  describe("성공", () => {
    it("RG | 200 | 성공 | 회원가입 성공", async () => {
      // given
      const payload: MemberRegisterDto = {
        name: "홍길동",
        email: "test@example.com",
        password: "Abc123!@",
      };
      const successResponse = {
        status: "SUCCESS",
        message: "회원가입이 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateRegisterRequest(payload)).not.toThrow();
      const response = await api.register(payload);

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
    it("RG | 409 | 실패 | 이미 존재하는 이메일", async () => {
      // given
      const payload: MemberRegisterDto = {
        name: "홍길동",
        email: "existing@example.com",
        password: "Abc123!@",
      };
      const errorResponse = {
        status: "ERROR",
        message: "이미 존재하는 이메일입니다",
        errorCode: "EMAIL_ALREADY_EXISTS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 409, errorResponse);

      // when & then
      await expect(api.register(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        ROUTE,
        payload,
        expect.anything()
      );
    });

    it("RG | 400 | 실패 | 이름 형식 오류", async () => {
      // given
      const payload: MemberRegisterDto = {
        name: "홍",
        email: "test@example.com",
        password: "Abc123!@",
      };
      const errorResponse = {
        status: "ERROR",
        message: "이름 형식이 올바르지 않습니다",
        errorCode: "INVALID_NAME_FORMAT",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.register(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("RG | 400 | 실패 | 이메일 형식 오류", async () => {
      // given
      const payload: MemberRegisterDto = {
        name: "홍길동",
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
      await expect(api.register(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("RG | 400 | 실패 | 비밀번호 형식 오류", async () => {
      // given
      const payload: MemberRegisterDto = {
        name: "홍길동",
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
      await expect(api.register(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
