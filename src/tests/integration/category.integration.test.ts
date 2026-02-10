import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTEGRATION_TEST_ENABLED } from "./integration.bootstrap";
import { setCurrentSession, SESSION_KIND_HEADER } from "../../utils/axios-cookie-auth";
import {
  integrationApi,
  generateUniqueName,
} from "../../utils/integration-helpers";
import { waitForAdminSession } from "../../utils/integration-session";
import type { CategoryRequestDto } from "../../generated/schemas";

const adminHeaders = { headers: { [SESSION_KIND_HEADER]: "admin" as const } };

const describeIf = INTEGRATION_TEST_ENABLED ? describe : describe.skip;

describeIf("Integration: Category API", () => {
  let createdCategoryIds: number[] = [];

  beforeAll(async () => {
    await waitForAdminSession();
    setCurrentSession("admin");
  });

  afterAll(async () => {
    const ids = [...createdCategoryIds];
    const deleteOne = (id: number) =>
      integrationApi.deleteCategory(id, adminHeaders).catch((e: any) => {
        throw { id, status: e?.response?.status };
      });
    let results = await Promise.allSettled(ids.map((id) => deleteOne(id)));
    const failedIds = results
      .map((r, i) => (r.status === "rejected" ? ids[i] : null))
      .filter((id): id is number => id != null);
    if (failedIds.length > 0) {
      results = await Promise.allSettled(failedIds.map((id) => deleteOne(id)));
      const failCount = results.filter((r) => r.status === "rejected").length;
      results.forEach((r, i) => {
        if (r.status === "rejected" && failedIds[i] != null) {
          const status = (r.reason as any)?.status;
          console.warn(`[teardown] category delete failed id=${failedIds[i]} status=${status ?? "unknown"}`);
        }
      });
      if (failCount > 0) {
        console.warn(`[teardown] category delete failed after retry: ${failCount} ids`);
      }
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
