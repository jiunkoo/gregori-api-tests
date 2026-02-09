import "dotenv/config";
import axios from "axios";
import { setupAxiosLogger } from "../../utils/logger";
import { setupCookieAuth } from "../../utils/axios-cookie-auth";
import {
  initializeGlobalTestSession,
  initializeAdminTestSession,
} from "../../utils/integration-session";

const baseURL = process.env.GREGORI_BASE_URL || process.env.API_URL;
if (!baseURL) {
  console.warn(
    "GREGORI_BASE_URL 환경 변수가 설정되지 않았습니다.\n" +
      "통합 테스트를 실행하려면 실제 서버 URL을 설정해야 합니다.\n" +
      "통합 테스트는 스킵됩니다."
  );
} else {
  console.log(`✓ 통합 테스트 실행: ${baseURL}`);
  axios.defaults.baseURL = baseURL;
  setupAxiosLogger(axios);
  setupCookieAuth(axios);
}

export const INTEGRATION_TEST_ENABLED = !!baseURL;
export const INTEGRATION_TEST_BASE_URL = baseURL || "";

export async function setup() {
  if (!INTEGRATION_TEST_ENABLED) {
    return;
  }

  await Promise.all([
    initializeGlobalTestSession(),
    initializeAdminTestSession(),
  ]);
}
