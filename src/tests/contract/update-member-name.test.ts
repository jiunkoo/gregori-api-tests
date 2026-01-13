import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../../generated/gregori-api";
import { mockSuccess, mockError } from "../../utils/mock-helpers";
import { setSessionCookie } from "../../utils/axios-cookie-auth";
import type { UpdateMemberNameBody } from "../../generated/schemas";

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

const ROUTE = `/member/name`;

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
} as const;

const validateUpdateMemberNameRequest = (payload: {
  dto?: { name?: string };
}): void => {
  if (!payload.dto?.name) {
    throw new Error(VALIDATION_ERRORS.NAME_REQUIRED);
  }

  const nameRegex = /^[가-힣]{2,10}$/;
  if (!nameRegex.test(payload.dto.name)) {
    throw new Error(VALIDATION_ERRORS.NAME_INVALID);
  }
};

describe("POST /member/name", () => {
  describe("검증", () => {
    it("UMN | PRE | 검증 | 필수값(name) 누락 — 요청 차단", () => {
      // given
      const payload = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {},
      };

      // when & then
      expect(() => validateUpdateMemberNameRequest(payload as any)).toThrow(
        VALIDATION_ERRORS.NAME_REQUIRED
      );
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
      "UMN | PRE | 검증 | 이름 형식 오류 ($description) — 요청 차단",
      ({ name }) => {
        // given
        const payload: UpdateMemberNameBody = {
          sessionMember: {
            id: 1,
            email: "test@example.com",
            authority: "GENERAL_MEMBER",
          },
          dto: { name },
        };

        // when & then
        expect(() => validateUpdateMemberNameRequest(payload)).toThrow(
          VALIDATION_ERRORS.NAME_INVALID
        );
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );
  });

  describe("성공", () => {
    it("UMN | 200 | 성공 | 회원 이름 변경 성공", async () => {
      // given
      const payload: UpdateMemberNameBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          name: "김철수",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "회원 이름이 변경되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateUpdateMemberNameRequest(payload)).not.toThrow();
      const response = await api.updateMemberName(payload);

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
    it("UMN | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const payload: UpdateMemberNameBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          name: "김철수",
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
      await expect(api.updateMemberName(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("UMN | 400 | 실패 | 이름 형식 오류", async () => {
      // given
      const payload: UpdateMemberNameBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          name: "홍",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "이름 형식이 올바르지 않습니다",
        errorCode: "INVALID_NAME_FORMAT",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.updateMemberName(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("UMN | 404 | 실패 | 존재하지 않는 회원", async () => {
      // given
      const payload: UpdateMemberNameBody = {
        sessionMember: {
          id: 999,
          email: "notfound@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          name: "김철수",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "회원을 찾을 수 없습니다",
        errorCode: "MEMBER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 404, errorResponse);

      // when & then
      await expect(api.updateMemberName(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
