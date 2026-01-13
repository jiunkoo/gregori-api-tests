import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AxiosResponse } from "axios";
import { INTEGRATION_TEST_ENABLED } from "./integration.bootstrap";
import {
  getTestAccount,
  waitForGlobalSession,
} from "../../utils/integration-session";
import { integrationApi } from "../../utils/integration-helpers";
import type { AuthSignInDto } from "../../generated/schemas";

const describeIf = INTEGRATION_TEST_ENABLED ? describe : describe.skip;

describeIf("Integration: Auth API", () => {
  let testEmail: string;
  let testPassword: string;
  let sessionCookie: string | null = null;

  beforeAll(async () => {
    await waitForGlobalSession();

    const testAccount = getTestAccount();
    if (!testAccount || !testAccount.email || !testAccount.password) {
      throw new Error(
        "전역 테스트 계정이 초기화되지 않았습니다. 전역 설정에서 회원가입이 완료되어야 합니다."
      );
    }
    testEmail = testAccount.email;
    testPassword = testAccount.password;
  });

  describe("POST /auth/signin", () => {
    it("SI | 200 | 성공 | 로그인 성공 — 세션 생성", async () => {
      // given
      expect(testEmail).toBeTruthy();
      expect(testPassword).toBeTruthy();
      const payload: AuthSignInDto = {
        email: testEmail,
        password: testPassword,
      };

      // when
      const response = (await integrationApi.signIn(payload)) as AxiosResponse;

      // then
      expect(response.status).toBe(200);
      expect(response.headers?.["set-cookie"]).toBeDefined();
    });

    it("SI | 401 | 실패 | 잘못된 이메일 또는 비밀번호", async () => {
      // given
      const payload: AuthSignInDto = {
        email: "nonexistent@integration.test",
        password: "Wrong123!@",
      };

      // when & then
      const error = await integrationApi.signIn(payload).catch((e) => e);
      expect(error.isAxiosError).toBe(true);
      expect([400, 401, 404]).toContain(error.response?.status);
    });
  });

  describe("POST /auth/signout", () => {
    it("SO | 200 | 성공 | 로그아웃 성공 — 세션 삭제", async () => {
      // given
      if (!sessionCookie) {
        const signInResponse = (await integrationApi.signIn({
          email: testEmail,
          password: testPassword,
        })) as AxiosResponse;
        const setCookieHeader = signInResponse.headers?.["set-cookie"];
        if (setCookieHeader) {
          sessionCookie = Array.isArray(setCookieHeader)
            ? setCookieHeader[0]
            : setCookieHeader;
        }
      }
      expect(sessionCookie).toBeTruthy();

      // when
      const response = (await integrationApi.signOut()) as AxiosResponse;

      // then
      expect(response.status).toBe(204);
    });
  });
});
