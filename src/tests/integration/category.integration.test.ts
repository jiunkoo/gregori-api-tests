import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTEGRATION_TEST_ENABLED } from "./integration.bootstrap";
import {
  integrationApi,
  generateUniqueName,
} from "../../utils/integration-helpers";
import { waitForAdminSession } from "../../utils/integration-session";
import type { CategoryRequestDto } from "../../generated/schemas";

const describeIf = INTEGRATION_TEST_ENABLED ? describe : describe.skip;

describeIf("Integration: Category API", () => {
  let createdCategoryIds: number[] = [];

  beforeAll(async () => {
    await waitForAdminSession();
  });

  afterAll(async () => {
    for (const categoryId of createdCategoryIds) {
      await integrationApi.deleteCategory(categoryId).catch(() => {});
    }
  });

  describe("POST /category", () => {
    it("CC | 200 | 성공 | 카테고리 생성 성공", async () => {
      // given
      const categoryName = generateUniqueName("카테고리");
      const payload: CategoryRequestDto = {
        name: categoryName,
      };

      // when
      const response = (await integrationApi.createCategory(payload)) as any;

      // then
      expect(response.status).toBe(201);
      const location = response.headers?.location || response.headers?.Location;
      expect(location).toMatch(/\/category\/\d+$/);
      const categoryIdMatch = location?.match(/\/category\/(\d+)/);
      if (categoryIdMatch) {
        createdCategoryIds.push(parseInt(categoryIdMatch[1], 10));
      }
    });
  });

  describe("GET /category", () => {
    it("GC | 200 | 성공 | 카테고리 목록 조회 성공", async () => {
      // given & when
      const response = (await integrationApi.getCategories()) as any;

      // then
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      if (response.data.length > 0) {
        expect(response.data[0]).toHaveProperty("id");
        expect(response.data[0]).toHaveProperty("name");
        expect(response.data[0]).toHaveProperty("createdAt");
        expect(response.data[0]).toHaveProperty("updatedAt");
      }
    });
  });

  describe("DELETE /category/{categoryId}", () => {
    it("DC | 204 | 성공 | 카테고리 삭제 성공", async () => {
      // given
      if (createdCategoryIds.length === 0) {
        throw new Error(
          "삭제할 카테고리가 없습니다. 카테고리 생성 테스트가 먼저 실행되어야 합니다."
        );
      }
      const categoryId = createdCategoryIds[createdCategoryIds.length - 1];

      // when
      const response = (await integrationApi.deleteCategory(categoryId)) as any;

      // then
      expect(response.status).toBe(204);
      createdCategoryIds.pop();
    });
  });
});
