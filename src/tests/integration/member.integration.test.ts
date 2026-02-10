import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTEGRATION_TEST_ENABLED } from "./integration.bootstrap";
import { getGlobalTestAccount, waitForGlobalSession } from "../../utils/integration-session";
import { setCurrentSession } from "../../utils/axios-cookie-auth";
import {
  integrationApi,
  generateUniqueName,
} from "../../utils/integration-helpers";
import type { GetMemberParams, MemberNameUpdateDto } from "../../generated/schemas";

const describeIf = INTEGRATION_TEST_ENABLED ? describe : describe.skip;

describeIf("Integration: Member API", () => {
  let testEmail: string;
  let testPassword: string;
  let testName: string;
  let createdMemberId: number | null = null;

  beforeAll(async () => {
    await waitForGlobalSession();
    setCurrentSession("general");
    const globalAccount = getGlobalTestAccount();
    testEmail = globalAccount.email || "";
    testPassword = globalAccount.password || "";
    testName = globalAccount.name || "";
    createdMemberId = globalAccount.memberId;
    if (!testEmail || !createdMemberId) {
      throw new Error(
        "전역 테스트 계정이 초기화되지 않았습니다. 통합 테스트 세션이 올바르게 설정되지 않았습니다."
      );
    }
  });

  describe("GET /member", () => {
    it("GM | 200 | 성공 | 회원 정보 조회 성공", async () => {
      // given
      const params: GetMemberParams = {
        sessionMember: {
          id: createdMemberId || 1,
          email: testEmail,
          authority: "GENERAL_MEMBER",
        },
      };

      // when
      const response = (await integrationApi.getMember(params)) as any;

      // then
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.email).toBe(testEmail);
      expect(response.data.name).toBeDefined();
    });


  describe("POST /member/name", () => {
    it("UMN | 200 | 성공 | 회원 이름 변경 성공", async () => {
      // given
      const newName = generateUniqueName("변경된");
      const dto: MemberNameUpdateDto = {
        name: newName,
      };

      // when
      const response = (await integrationApi.updateMemberName(dto as any)) as any;

      // then
      expect(response.status).toBe(204);
    });
  });

    it("GM | 404 | 실패 | 인증되지 않은 사용자", async () => {
      // given
      const params: GetMemberParams = {
        sessionMember: {
          id: 1,
          email: "test@example.com",
          authority: "GENERAL_MEMBER",
        },
      };

      // when & then
      const error = await integrationApi
        .getMember(params, {
          headers: {
            Cookie: "",
            "x-skip-auth": "true",
          },
        })
        .catch((e) => e);
      expect(error.isAxiosError).toBe(true);
      expect(error.response?.status).toBe(404);
    });
  });
});
