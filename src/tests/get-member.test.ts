import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";
import type { GetMemberParams } from "../generated/schemas";

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
  data: z.object({
    id: z.number(),
    email: z.string().email(),
    name: z.string(),
    authority: z.enum(["GENERAL_MEMBER", "SELLING_MEMBER", "ADMIN_MEMBER"]),
    isDeleted: z.enum(["TRUE", "FALSE"]),
  }),
});

describe("GET /member", () => {
  describe("성공", () => {
    it("GM | 200 | 성공 | 회원 정보 조회 성공", async () => {
      // given
      const params: GetMemberParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
      };
      const successResponse = {
        status: "SUCCESS",
        message: "회원 정보 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: {
          id: 1,
          email: "test@example.com",
          name: "홍길동",
          authority: "GENERAL_MEMBER" as const,
          isDeleted: "FALSE" as const,
        },
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getMember(params);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]?.params?.sessionMember).toEqual(params.sessionMember);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.data.id).toBeTypeOf("number");
      expect(validatedData.data.email).toBeTypeOf("string");
      expect(validatedData.data.name).toBeTypeOf("string");
      expect(["GENERAL_MEMBER", "SELLING_MEMBER", "ADMIN_MEMBER"]).toContain(
        validatedData.data.authority
      );
      expect(["TRUE", "FALSE"]).toContain(validatedData.data.isDeleted);
    });
  });

  describe("실패", () => {
    it("GM | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const params: GetMemberParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
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
      await expect(api.getMember(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GM | 404 | 실패 | 존재하지 않는 회원", async () => {
      // given
      const params: GetMemberParams = {
        sessionMember: {
          id: 999,
          email: "notfound@example.com",
          authority: "GENERAL_MEMBER",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "회원을 찾을 수 없습니다",
        errorCode: "MEMBER_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 404, errorResponse);

      // when & then
      await expect(api.getMember(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GM | 400 | 실패 | 잘못된 요청", async () => {
      // given
      const params: GetMemberParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
      };
      const errorResponse = {
        status: "ERROR",
        message: "잘못된 요청입니다",
        errorCode: "INVALID_REQUEST",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 400, errorResponse);

      // when & then
      await expect(api.getMember(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
