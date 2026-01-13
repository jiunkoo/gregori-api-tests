import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGregoriApi } from "../../generated/gregori-api";
import { mockSuccess, mockError } from "../../utils/mock-helpers";

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
  data: categorySchema,
});

describe("GET /category/{categoryId}", () => {
  describe("성공", () => {
    it("GCI | 200 | 성공 | 카테고리 상세 조회 성공", async () => {
      // given
      const categoryId = 1;
      const ROUTE = `/category/${categoryId}`;
      const successResponse = {
        status: "SUCCESS",
        message: "카테고리 조회가 완료되었습니다",
        timestamp: "2025-08-07T12:30:00.123Z",
        data: {
          id: 1,
          name: "전자제품",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      };
      mockSuccess(mockedAxios.get, successResponse);

      // when
      const response = await api.getCategory(categoryId);

      // then
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe(ROUTE);
      expect(response.status).toBe(200);
      expect(response.data).toEqual(successResponse);

      const validatedData = successResponseSchema.parse(response.data);
      expect(validatedData.data.id).toBe(categoryId);
      if (validatedData.data.name) {
        expect(validatedData.data.name).toBeTypeOf("string");
      }
    });
  });

  describe("실패", () => {
    it("GCI | 404 | 실패 | 존재하지 않는 카테고리", async () => {
      // given
      const categoryId = 999;
      const errorResponse = {
        status: "ERROR",
        message: "카테고리를 찾을 수 없습니다",
        errorCode: "CATEGORY_NOT_FOUND",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 404, errorResponse);

      // when & then
      await expect(api.getCategory(categoryId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("GCI | 400 | 실패 | 잘못된 카테고리 ID", async () => {
      // given
      const categoryId = 0;
      const errorResponse = {
        status: "ERROR",
        message: "잘못된 카테고리 ID입니다",
        errorCode: "INVALID_CATEGORY_ID",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockError(mockedAxios.get, 400, errorResponse);

      // when & then
      await expect(api.getCategory(categoryId)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
