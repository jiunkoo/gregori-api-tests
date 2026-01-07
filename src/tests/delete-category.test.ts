import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import { setSessionCookie } from "../utils/axios-cookie-auth";

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

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
});

describe("DELETE /category/{categoryId}", () => {
  describe("성공", () => {
    it("DC | 200 | 성공 | 카테고리 삭제 성공", async () => {
      // given
      const categoryId = 1;
      const ROUTE = `/category/${categoryId}`;
      const successResponse = {
        status: "SUCCESS",
        message: "카테고리가 삭제되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.delete, successResponse);

      // when
      const response = await api.deleteCategory(categoryId);

      // then
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.delete.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.status).toBe("SUCCESS");
      expect(validatedData.message).toBeTypeOf("string");
    });
  });

  describe("실패", () => {
    it("DC | 401 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      setSessionCookie(null);
      const categoryId = 1;
      const errorResponse = {
        status: "ERROR",
        message: "인증이 필요합니다",
        errorCode: "UNAUTHORIZED",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 401, errorResponse);

      // when & then
      await expect(api.deleteCategory(categoryId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DC | 404 | 실패 | 존재하지 않는 카테고리", async () => {
      // given
      const categoryId = 999;
      const errorResponse = {
        status: "ERROR",
        message: "카테고리를 찾을 수 없습니다",
        errorCode: "CATEGORY_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 404, errorResponse);

      // when & then
      await expect(api.deleteCategory(categoryId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DC | 409 | 실패 | 사용 중인 카테고리 (삭제 불가)", async () => {
      // given
      const categoryId = 1;
      const errorResponse = {
        status: "ERROR",
        message: "사용 중인 카테고리는 삭제할 수 없습니다",
        errorCode: "CATEGORY_IN_USE",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 409, errorResponse);

      // when & then
      await expect(api.deleteCategory(categoryId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });

    it("DC | 400 | 실패 | 잘못된 카테고리 ID", async () => {
      // given
      const categoryId = 0;
      const errorResponse = {
        status: "ERROR",
        message: "잘못된 카테고리 ID입니다",
        errorCode: "INVALID_CATEGORY_ID",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.delete, 400, errorResponse);

      // when & then
      await expect(api.deleteCategory(categoryId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
    });
  });
});
