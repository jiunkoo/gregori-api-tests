import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { UpdateMemberPasswordBody } from "../generated/schemas";

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

const ROUTE = `/member/password`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

const VALIDATION_ERRORS = {
  OLD_PASSWORD_REQUIRED: "oldPassword는 필수값입니다",
  NEW_PASSWORD_REQUIRED: "newPassword는 필수값입니다",
  PASSWORD_INVALID:
    "password는 최소 2개의 알파벳, 1개의 숫자, 1개의 특수문자를 포함한 8-15자여야 합니다",
  SAME_PASSWORD: "새 비밀번호는 기존 비밀번호와 달라야 합니다",
} as const;

const validateUpdateMemberPasswordRequest = (payload: {
  dto?: { oldPassword?: string; newPassword?: string };
}): void => {
  if (!payload.dto?.oldPassword) {
    throw new Error(VALIDATION_ERRORS.OLD_PASSWORD_REQUIRED);
  }
  if (!payload.dto?.newPassword) {
    throw new Error(VALIDATION_ERRORS.NEW_PASSWORD_REQUIRED);
  }

  const passwordRegex =
    /^(?=(.*[a-zA-Z].*){2,})(?=.*\d.*)(?=.*\W.*)[a-zA-Z0-9\S]{8,15}$/;

  if (!passwordRegex.test(payload.dto.oldPassword)) {
    throw new Error(VALIDATION_ERRORS.PASSWORD_INVALID);
  }
  if (!passwordRegex.test(payload.dto.newPassword)) {
    throw new Error(VALIDATION_ERRORS.PASSWORD_INVALID);
  }
  if (payload.dto.oldPassword === payload.dto.newPassword) {
    throw new Error(VALIDATION_ERRORS.SAME_PASSWORD);
  }
};

describe("POST /member/password", () => {
  describe("검증", () => {
    it.each([
      {
        field: "oldPassword",
        payload: {
          dto: {
            newPassword: "NewPass123!@",
          },
        },
      },
      {
        field: "newPassword",
        payload: {
          dto: {
            oldPassword: "OldPass123!@",
          },
        },
      },
    ])("UMP | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      // when & then
      expect(() =>
        validateUpdateMemberPasswordRequest(payload as any)
      ).toThrow();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it.each([
      {
        description: "oldPassword 알파벳 부족",
        oldPassword: "A123!@#$",
        newPassword: "NewPass123!@",
      },
      {
        description: "newPassword 알파벳 부족",
        oldPassword: "OldPass123!@",
        newPassword: "A123!@#$",
      },
      {
        description: "oldPassword 숫자 부족",
        oldPassword: "OldPass!@",
        newPassword: "NewPass123!@",
      },
      {
        description: "newPassword 숫자 부족",
        oldPassword: "OldPass123!@",
        newPassword: "NewPass!@",
      },
      {
        description: "oldPassword 특수문자 부족",
        oldPassword: "OldPass123",
        newPassword: "NewPass123!@",
      },
      {
        description: "newPassword 특수문자 부족",
        oldPassword: "OldPass123!@",
        newPassword: "NewPass123",
      },
      {
        description: "oldPassword 길이 부족",
        oldPassword: "Ab1!def",
        newPassword: "NewPass123!@",
      },
      {
        description: "newPassword 길이 부족",
        oldPassword: "OldPass123!@",
        newPassword: "Ab1!def",
      },
    ])(
      "UMP | PRE | 검증 | 비밀번호 형식 오류 ($description) — 요청 차단",
      ({ oldPassword, newPassword }) => {
        // given
        const payload = {
          dto: { oldPassword, newPassword },
        };

        // when & then
        expect(() => validateUpdateMemberPasswordRequest(payload)).toThrow(
          VALIDATION_ERRORS.PASSWORD_INVALID
        );
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );

    it("UMP | PRE | 검증 | 기존 비밀번호와 동일 — 요청 차단", () => {
      // given
      const payload = {
        dto: {
          oldPassword: "SamePass123!@",
          newPassword: "SamePass123!@",
        },
      };

      // when & then
      expect(() => validateUpdateMemberPasswordRequest(payload)).toThrow(
        VALIDATION_ERRORS.SAME_PASSWORD
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("성공", () => {
    it("UMP | 200 | 성공 | 회원 비밀번호 변경 성공", async () => {
      // given
      const payload: UpdateMemberPasswordBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          oldPassword: "OldPass123!@",
          newPassword: "NewPass123!@",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "비밀번호가 변경되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateUpdateMemberPasswordRequest(payload)).not.toThrow();
      const response = await api.updateMemberPassword(payload);

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
    it("UMP | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const payload: UpdateMemberPasswordBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          oldPassword: "OldPass123!@",
          newPassword: "NewPass123!@",
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
      await expect(api.updateMemberPassword(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("UMP | 401 | 실패 | 잘못된 기존 비밀번호", async () => {
      // given
      const payload: UpdateMemberPasswordBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          oldPassword: "WrongPass123!@",
          newPassword: "NewPass123!@",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "기존 비밀번호가 올바르지 않습니다",
        errorCode: "INVALID_OLD_PASSWORD",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 401, errorResponse);

      // when & then
      await expect(api.updateMemberPassword(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("UMP | 400 | 실패 | 비밀번호 형식 오류", async () => {
      // given
      const payload: UpdateMemberPasswordBody = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          oldPassword: "OldPass123!@",
          newPassword: "short",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "비밀번호 형식이 올바르지 않습니다",
        errorCode: "INVALID_PASSWORD_FORMAT",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(api.updateMemberPassword(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("UMP | 404 | 실패 | 존재하지 않는 회원", async () => {
      // given
      const payload: UpdateMemberPasswordBody = {
        sessionMember: {
          id: 999,
          email: "notfound@example.com",
          authority: "GENERAL_MEMBER",
        },
        dto: {
          oldPassword: "OldPass123!@",
          newPassword: "NewPass123!@",
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
      await expect(api.updateMemberPassword(payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
