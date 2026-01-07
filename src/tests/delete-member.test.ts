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

const ROUTE = `/member`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

describe("DELETE /member", () => {
  describe("성공", () => {
    it("DM | 200 | 성공 | 회원 탈퇴 성공", async () => {
      // given
      const sessionMember: SessionMember = {
        id: 1,
        email: "test@example.com",
        authority: "GENERAL_MEMBER",
      };
      const successResponse = {
        status: "SUCCESS",
        message: "회원 탈퇴가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.delete, successResponse);

      // when
      const response = await api.deleteMember(sessionMember);

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
    it("DM | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const sessionMember: SessionMember = {
        id: 1,
        email: "test@example.com",
        authority: "GENERAL_MEMBER",
      };
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 401, errorResponse);

      // when & then
      await expect(api.deleteMember(sessionMember)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DM | 404 | 실패 | 존재하지 않는 회원", async () => {
      // given
      const sessionMember: SessionMember = {
        id: 999,
        email: "notfound@example.com",
        authority: "GENERAL_MEMBER",
      };
      const errorResponse = {
        status: "ERROR",
        message: "회원을 찾을 수 없습니다",
        errorCode: "MEMBER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 404, errorResponse);

      // when & then
      await expect(api.deleteMember(sessionMember)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DM | 409 | 실패 | 진행 중인 주문이 있는 회원", async () => {
      // given
      const sessionMember: SessionMember = {
        id: 1,
        email: "test@example.com",
        authority: "GENERAL_MEMBER",
      };
      const errorResponse = {
        status: "ERROR",
        message: "진행 중인 주문이 있어 탈퇴할 수 없습니다",
        errorCode: "MEMBER_HAS_ACTIVE_ORDERS",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 409, errorResponse);

      // when & then
      await expect(api.deleteMember(sessionMember)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });
  });
});
