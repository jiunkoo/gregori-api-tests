import { getGregoriApi } from "../generated/gregori-api";
import {
  extractCookieValue,
  setGeneralSessionCookie,
  setAdminSessionCookie,
  SESSION_KIND_HEADER,
} from "./axios-cookie-auth";
import { isIntegrationEnabled } from "./integration-axios";
import { setSharedTestAccount, getSharedTestAccount } from "./integration-helpers";

let globalSessionInitialized: Promise<void> | null = null;
let adminSessionInitialized: Promise<void> | null = null;

type Account = {
  email: string;
  password: string;
  name: string;
  memberId: number | null;
};

function loadGeneralAccount(): Account {
  const email =
    process.env.TEST_GENERAL_MEMBER_EMAIL ?? "test-general-member@integration.test";
  const password = process.env.TEST_GENERAL_MEMBER_PASSWORD;
  const name = process.env.TEST_GENERAL_MEMBER_NAME ?? "일반회원테스트";
  const memberId = process.env.INTEGRATION_TEST_MEMBER_ID
    ? parseInt(process.env.INTEGRATION_TEST_MEMBER_ID, 10)
    : null;

  if (!password) {
    throw new Error(
      "TEST_GENERAL_MEMBER_PASSWORD 환경 변수가 설정되지 않았습니다."
    );
  }

  return { email, password, name, memberId };
}

function loadAdminAccount(): Account {
  const email =
    process.env.TEST_ADMIN_MEMBER_EMAIL ?? "test-admin-member@integration.test";
  const password = process.env.TEST_ADMIN_MEMBER_PASSWORD;
  const name = process.env.TEST_ADMIN_MEMBER_NAME ?? "관리자테스트";

  if (!password) {
    throw new Error(
      "TEST_ADMIN_MEMBER_PASSWORD 환경 변수가 설정되지 않았습니다."
    );
  }

  return { email, password, name, memberId: null };
}

function saveGeneralAccountToEnv(account: Account) {
  if (typeof process === "undefined") return;
  process.env.TEST_GENERAL_MEMBER_EMAIL = account.email;
  process.env.TEST_GENERAL_MEMBER_PASSWORD = account.password;
  process.env.TEST_GENERAL_MEMBER_NAME = account.name;
  if (account.memberId != null) {
    process.env.INTEGRATION_TEST_MEMBER_ID = String(account.memberId);
  }
}

export async function initializeGlobalTestSession(): Promise<void> {
  if (!isIntegrationEnabled()) return;
  if (globalSessionInitialized) {
    await globalSessionInitialized;
    return;
  }

  const done = (async () => {
    const account = loadGeneralAccount();
    const api = getGregoriApi();
    const res = (await api.signIn({
      email: account.email,
      password: account.password,
    })) as any;

    if (res?.status !== 200) {
      throw new Error(`로그인 실패: ${res?.status ?? "unknown"}`);
    }

    const setCookie =
      res.headers?.["set-cookie"] ?? res.headers?.["Set-Cookie"];
    const cookie = extractCookieValue(setCookie);
    if (!cookie) {
      throw new Error("로그인 응답에 세션 쿠키가 없습니다.");
    }

    setGeneralSessionCookie(cookie);

    let memberId = account.memberId;
    if (memberId == null && res?.data) {
      const d = res.data as any;
      memberId =
        d?.data?.id ??
        d?.member?.id ??
        d?.sessionMember?.id ??
        d?.id ??
        null;
    }
    if (memberId == null) {
      try {
        const memberRes = (await api.getMember(
          {
            sessionMember: {
              email: account.email,
              authority: "GENERAL_MEMBER",
            },
          },
          { headers: { [SESSION_KIND_HEADER]: "general" } }
        )) as any;
        const memberData = memberRes?.data?.data ?? memberRes?.data ?? memberRes;
        if (memberData?.id != null) memberId = memberData.id;
      } catch {
      }
    }

    const full = { ...account, memberId };
    setSharedTestAccount(full);
    saveGeneralAccountToEnv(full);
  })();

  globalSessionInitialized = done;
  await done;
}

export async function initializeAdminTestSession(): Promise<void> {
  if (!isIntegrationEnabled()) return;
  if (adminSessionInitialized) {
    await adminSessionInitialized;
    return;
  }

  const done = (async () => {
    const account = loadAdminAccount();
    const api = getGregoriApi();
    const res = (await api.signIn({
      email: account.email,
      password: account.password,
    })) as any;

    if (res?.status !== 200) {
      throw new Error(`관리자 로그인 실패: ${res?.status ?? "unknown"}`);
    }

    const setCookie =
      res.headers?.["set-cookie"] ?? res.headers?.["Set-Cookie"];
    const cookie = extractCookieValue(setCookie);
    if (!cookie) {
      throw new Error("관리자 로그인 응답에 세션 쿠키가 없습니다.");
    }

    setAdminSessionCookie(cookie);
  })();

  adminSessionInitialized = done;
  await done;
}

export async function waitForGlobalSession(): Promise<void> {
  await initializeGlobalTestSession();
}

export async function waitForAdminSession(): Promise<void> {
  await initializeAdminTestSession();
}

export function getGlobalTestAccount(): Account {
  const shared = getSharedTestAccount();
  if (shared?.email && shared?.password) {
    return {
      email: shared.email,
      password: shared.password,
      name: shared.name ?? "",
      memberId: shared.memberId ?? null,
    };
  }
  return loadGeneralAccount();
}

export function getTestAccount(): Account {
  return getGlobalTestAccount();
}
