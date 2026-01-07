import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../generated/gregori-api";
import { mockSuccess, mockError } from "../utils/mock-helpers";
import type { GetCategoriesParams } from "../generated/schemas";

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

const ROUTE = `/category`;

const categorySchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
  data: z.array(categorySchema),
});

describe("GET /category", () => {
  describe("성공", () => {
    it("GC | 200 | 성공 | 카테고리 목록 조회 성공 (파라미터 없음)", async () => {
      // given
      const successResponse = {
        status: "SUCCESS",
        message: "카테고리 목록 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: [
          {
            id: 1,
            name: "전자제품",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          {
            id: 2,
            name: "의류",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ],
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getCategories();

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(Array.isArray(validatedData.data)).toBe(true);
      expect(validatedData.data.length).toBeGreaterThan(0);
      validatedData.data.forEach((category) => {
        if (category.id !== undefined) {
          expect(category.id).toBeTypeOf("number");
        }
        if (category.name !== undefined) {
          expect(category.name).toBeTypeOf("string");
        }
      });
    });

    it("GC | 200 | 성공 | 카테고리 목록 조회 성공 (페이지 파라미터)", async () => {
      // given
      const params: GetCategoriesParams = {
        page: 1,
      };
      const successResponse = {
        status: "SUCCESS",
        message: "카테고리 목록 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: [
          {
            id: 1,
            name: "전자제품",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ],
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getCategories(params);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(callArgs[1]?.params?.page).toBe(params.page);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(Array.isArray(validatedData.data)).toBe(true);
    });
  });

  describe("실패", () => {
    it("GC | 400 | 실패 | 잘못된 페이지 번호", async () => {
      // given
      const params: GetCategoriesParams = {
        page: -1,
      };
      const errorResponse = {
        status: "ERROR",
        message: "잘못된 페이지 번호입니다",
        errorCode: "INVALID_PAGE",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 400, errorResponse);

      // when & then
      await expect(api.getCategories(params)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GC | 500 | 실패 | 서버 오류", async () => {
      // given
      const errorResponse = {
        status: "ERROR",
        message: "서버 오류가 발생했습니다",
        errorCode: "INTERNAL_SERVER_ERROR",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 500, errorResponse);

      // when & then
      await expect(api.getCategories()).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 500, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
