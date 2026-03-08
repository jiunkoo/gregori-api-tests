import { getGregoriApi } from "../generated/gregori-api";
import {
  extractCookieValue,
  setGeneralSessionCookie,
  setAdminSessionCookie,
  SESSION_KIND_HEADER,
} from "./axios-cookie-auth";
import { isIntegrationEnabled } from "./integration-axios";
import {
  setSharedTestAccount,
  getSharedTestAccount,
} from "./integration-helpers";

type Slot = "global" | "admin";

const initSlots: Record<Slot, Promise<void> | null> = {
  global: null,
  admin: null,
};

type Account = {
  email: string;
  password: string;
  name: string;
  memberId: number | null;
};

type HeadersLike =
  | { "set-cookie"?: string | string[]; "Set-Cookie"?: string | string[] }
  | null
  | undefined;

type HttpResponseLike = {
  status: number;
  headers: HeadersLike;
  data: unknown;
};

type ApiWithGetMember = {
  getMember(...args: unknown[]): Promise<unknown>;
};

function loadGeneralAccount(): Account {
  const email =
    process.env.TEST_GENERAL_MEMBER_EMAIL ??
    "test-general-member@integration.test";
  const password = process.env.TEST_GENERAL_MEMBER_PASSWORD;
  const name = process.env.TEST_GENERAL_MEMBER_NAME ?? "일반회원테스트";
  const memberId = readFiniteNumber(process.env.INTEGRATION_TEST_MEMBER_ID);

  if (!password) {
    throw new Error(
      "TEST_GENERAL_MEMBER_PASSWORD 환경 변수가 설정되지 않았습니다.",
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
      "TEST_ADMIN_MEMBER_PASSWORD 환경 변수가 설정되지 않았습니다.",
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

function getSetCookie(headers: HeadersLike): string[] | string | undefined {
  if (!headers) return undefined;
  return headers["set-cookie"] ?? headers["Set-Cookie"];
}

function requireCookieFromHeaders(
  headers: HeadersLike,
  context: string,
): string {
  const setCookie = getSetCookie(headers);
  const cookie = setCookie !== undefined ? extractCookieValue(setCookie) : null;
  if (!cookie) {
    throw new Error(`${context} 응답에 세션 쿠키가 없습니다.`);
  }
  return cookie;
}

function readFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractMemberId(payload: unknown): number | null {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  const from = (obj: unknown) =>
    obj != null && typeof obj === "object"
      ? readFiniteNumber((obj as Record<string, unknown>).id)
      : null;

  const id =
    from(p.data) ??
    from(p.member) ??
    from(p.sessionMember) ??
    readFiniteNumber(p.id);
  return id;
}

function assertHttpResponse(
  res: unknown,
  context: string,
): asserts res is HttpResponseLike {
  if (
    !res ||
    typeof res !== "object" ||
    !("status" in res) ||
    typeof (res as { status: unknown }).status !== "number"
  ) {
    throw new Error(`${context} 응답 형식이 올바르지 않습니다.`);
  }
}

function ensureStatus200(res: HttpResponseLike, context: string) {
  if (res.status !== 200) {
    throw new Error(`${context} 실패: ${res.status}`);
  }
}

function isAuthDebugEnabled(): boolean {
  return process.env.DEBUG_INTEGRATION_AUTH === "1";
}

function debugAuthLog(...args: unknown[]) {
  if (!isAuthDebugEnabled()) return;
  console.log("[integration-auth]", ...args);
}

async function initializeOnce(slot: Slot, factory: () => Promise<void>) {
  if (!isIntegrationEnabled()) return;

  const current = initSlots[slot];
  if (current) {
    await current;
    return;
  }

  const promise = factory().catch((err) => {
    initSlots[slot] = null;
    throw err;
  });

  initSlots[slot] = promise;
  await promise;
}

async function tryResolveMemberId(
  api: ApiWithGetMember,
  email: string,
): Promise<number | null> {
  try {
    const memberRes = (await api.getMember(
      {
        sessionMember: {
          email,
          authority: "GENERAL_MEMBER",
        },
      },
      { headers: { [SESSION_KIND_HEADER]: "general" } },
    )) as any;

    const memberData =
      memberRes?.data?.data ?? memberRes?.data ?? memberRes ?? null;

    const id = extractMemberId(memberData);
    if (id == null) debugAuthLog("memberId resolve failed: no id in response");
    return id;
  } catch (e) {
    debugAuthLog("memberId resolve failed:", e);
    return null;
  }
}

export async function initializeGlobalTestSession(): Promise<void> {
  await initializeOnce("global", async () => {
    const account = loadGeneralAccount();
    const api = getGregoriApi();

    const res = (await api.signIn({
      email: account.email,
      password: account.password,
    })) as any;

    assertHttpResponse(res, "로그인");
    ensureStatus200(res, "로그인");

    const cookie = requireCookieFromHeaders(res.headers, "로그인");
    setGeneralSessionCookie(cookie);

    let memberId = account.memberId ?? extractMemberId(res.data);

    if (memberId == null) {
      memberId = await tryResolveMemberId(api, account.email);
    }

    const full: Account = { ...account, memberId };
    setSharedTestAccount(full);
    saveGeneralAccountToEnv(full);
  });
}

export async function initializeAdminTestSession(): Promise<void> {
  await initializeOnce("admin", async () => {
    const account = loadAdminAccount();
    const api = getGregoriApi();

    const res = (await api.signIn({
      email: account.email,
      password: account.password,
    })) as any;

    assertHttpResponse(res, "관리자 로그인");
    ensureStatus200(res, "관리자 로그인");

    const cookie = requireCookieFromHeaders(res.headers, "관리자 로그인");
    setAdminSessionCookie(cookie);
  });
}

export async function waitForGlobalSession(): Promise<void> {
  await initializeGlobalTestSession();
}

export async function waitForAdminSession(): Promise<void> {
  await initializeAdminTestSession();
}

export function getGlobalTestAccount(): Account {
  const shared = getSharedTestAccount();

  if (
    shared &&
    typeof shared.email === "string" &&
    typeof shared.password === "string"
  ) {
    return {
      email: shared.email,
      password: shared.password,
      name: typeof shared.name === "string" ? shared.name : "",
      memberId: typeof shared.memberId === "number" ? shared.memberId : null,
    };
  }

  return loadGeneralAccount();
}

export function getTestAccount(): Account {
  return getGlobalTestAccount();
}
