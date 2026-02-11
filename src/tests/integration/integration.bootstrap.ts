import "dotenv/config";
import axios from "axios";
import { setupAxiosLogger } from "../../utils/logger";
import {
  setupCookieAuth,
  setCurrentSession,
  clearSessionCookie,
} from "../../utils/axios-cookie-auth";
import { setIntegrationBaseURL } from "../../utils/integration-axios";
import {
  initializeGlobalTestSession,
  initializeAdminTestSession,
} from "../../utils/integration-session";

const resolveIntegrationBaseURL = (): string | null => {
  const raw = process.env.API_URL;
  if (!raw) return null;

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
  throw new Error(
    "통합 테스트를 실행하려면 API_URL 환경 변수가 필요합니다.\n" +
      "· API_URL을 설정했는지 확인하세요.\n" +
      "· 값은 공백이 아니어야 하며, http:// 또는 https://로 시작해야 합니다.\n" +
      "예: API_URL=http://localhost:8080"
  );
}

console.debug(`✓ 통합 테스트 실행: ${baseURL}`);

setIntegrationBaseURL(baseURL);
axios.defaults.baseURL = baseURL;

setupAxiosLogger(axios);
setupCookieAuth(axios);

export async function setup() {
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
