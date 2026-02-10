import "dotenv/config";
import axios from "axios";
import { setupAxiosLogger } from "../../utils/logger";
import { setupCookieAuth, setCurrentSession, clearSessionCookie } from "../../utils/axios-cookie-auth";
import { setIntegrationBaseURL } from "../../utils/integration-axios";
import {
  initializeGlobalTestSession,
  initializeAdminTestSession,
} from "../../utils/integration-session";

const resolveIntegrationBaseURL = (): string | null => {
  const raw = process.env.API_URL;
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    console.warn("API_URL은 http:// 또는 https://로 시작해야 합니다.");
    return null;
  }
  return trimmed;
};

const baseURL = resolveIntegrationBaseURL();

if (!baseURL) {
  console.warn(
    "API_URL 환경 변수가 설정되지 않았거나 URL 형식이 아닙니다.\n" +
      "통합 테스트를 실행하려면 API_URL에 서버 URL(예: http://localhost:8080)을 설정하세요.\n" +
      "통합 테스트는 스킵됩니다."
  );
} else {
  console.log(`✓ 통합 테스트 실행: ${baseURL}`);
  setIntegrationBaseURL(baseURL);
  axios.defaults.baseURL = baseURL;
  setupAxiosLogger(axios);
  setupCookieAuth(axios);
}

export const INTEGRATION_TEST_ENABLED = !!baseURL;
export const INTEGRATION_TEST_BASE_URL = baseURL ?? "";

export async function setup() {
  if (!INTEGRATION_TEST_ENABLED) {
    return;
  }
  setCurrentSession(null);
  await initializeGlobalTestSession();
  await initializeAdminTestSession();
  setCurrentSession("general");
}

export async function teardown() {
  clearSessionCookie();
}

export default async function globalSetup() {
  await setup();
  return teardown;
}
