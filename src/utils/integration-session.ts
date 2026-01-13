import { getGregoriApi } from "../generated/gregori-api";
import { setSessionCookie, getSessionCookie } from "./axios-cookie-auth";
import { INTEGRATION_TEST_ENABLED } from "../tests/integration/integration.bootstrap";
import {
  setSharedTestAccount,
  getSharedTestAccount,
  generateUniqueEmail,
  generateUniqueName,
} from "./integration-helpers";

let globalTestEmail: string | null = null;
let globalTestPassword: string | null = null;
let globalTestMemberId: number | null = null;
let globalTestName: string | null = null;
let globalSessionInitialized: Promise<void> | null = null;
let globalSessionInitializedResolve: (() => void) | null = null;

let adminTestEmail: string | null = null;
let adminTestPassword: string | null = null;
let adminTestMemberId: number | null = null;
let adminTestName: string | null = null;
let adminSessionInitialized: Promise<void> | null = null;
let adminSessionInitializedResolve: (() => void) | null = null;

const saveAccountToEnvironment = (
  email: string,
  password: string,
  name: string,
  memberId: number | null
) => {
  if (typeof process !== "undefined") {
    process.env.INTEGRATION_TEST_EMAIL = email;
    process.env.INTEGRATION_TEST_PASSWORD = password;
    process.env.INTEGRATION_TEST_NAME = name;
    if (memberId) {
      process.env.INTEGRATION_TEST_MEMBER_ID = String(memberId);
    }
  }
};

const saveAdminAccountToEnvironment = (
  email: string,
  password: string,
  name: string,
  memberId: number | null
) => {
  if (typeof process !== "undefined") {
    process.env.ADMIN_TEST_EMAIL = email;
    process.env.ADMIN_TEST_PASSWORD = password;
    process.env.ADMIN_TEST_NAME = name;
    if (memberId) {
      process.env.ADMIN_TEST_MEMBER_ID = String(memberId);
    }
  }
};

const extractSessionCookie = (
  setCookieHeader: string | string[]
): string | null => {
  if (!setCookieHeader) return null;

  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];

  for (const cookie of cookies) {
    const cookieParts = cookie.split(";");
    if (cookieParts.length > 0) {
      const nameValue = cookieParts[0].trim();
      if (nameValue) {
        return nameValue;
      }
    }
  }

  return null;
};

const loadAccountFromEnvironment = () => {
  const envEmail = process.env.INTEGRATION_TEST_EMAIL;
  const envPassword = process.env.INTEGRATION_TEST_PASSWORD;

  if (!envEmail || !envPassword) {
    return null;
  }

  globalTestEmail = envEmail;
  globalTestPassword = envPassword;
  globalTestName = process.env.INTEGRATION_TEST_NAME || "전역테스트";
  globalTestMemberId = process.env.INTEGRATION_TEST_MEMBER_ID
    ? parseInt(process.env.INTEGRATION_TEST_MEMBER_ID, 10)
    : null;

  setSharedTestAccount({
    email: globalTestEmail,
    password: globalTestPassword,
    name: globalTestName,
    memberId: globalTestMemberId,
  });

  return { email: envEmail, password: envPassword, name: globalTestName };
};

const loadAdminAccountFromEnvironment = () => {
  const envEmail = process.env.ADMIN_TEST_EMAIL || "admin@integration.test";
  const envPassword = process.env.ADMIN_TEST_PASSWORD || "aa11111!";

  adminTestEmail = envEmail;
  adminTestPassword = envPassword;
  adminTestName = process.env.ADMIN_TEST_NAME || "관리자";

  return { email: envEmail, password: envPassword, name: adminTestName };
};

const createNewTestAccount = async (api: any) => {
  globalTestEmail = generateUniqueEmail("integration");
  globalTestPassword = "Test123!@";
  globalTestName = generateUniqueName("통합테스트");

  try {
    const registerResponse = (await api.register({
      name: globalTestName,
      email: globalTestEmail,
      password: globalTestPassword,
    })) as any;

    if (
      registerResponse?.data &&
      typeof registerResponse.data === "object" &&
      "data" in registerResponse.data
    ) {
      globalTestMemberId = registerResponse.data.data?.id || null;
    }

    if (!globalTestMemberId && registerResponse?.status === 201) {
      const location =
        registerResponse.headers?.location ||
        registerResponse.headers?.Location;
      if (location) {
        const memberIdMatch = location.match(/\/member\/(\d+)/);
        if (memberIdMatch) {
          globalTestMemberId = parseInt(memberIdMatch[1], 10);
        }
      }
    }

    console.log(
      `[INFO] 전역 테스트 계정 생성 완료: ${globalTestEmail} (ID: ${globalTestMemberId})`
    );
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log(
        `[WARN] 전역 테스트 계정이 이미 존재합니다 (${globalTestEmail}). 로그인 시도...`
      );
    } else {
      console.log(
        `[ERROR] 회원가입 실패 (${error.response?.status || "unknown"}): ${
          error.message
        }`
      );
      throw error;
    }
  }
};

const signInAndSaveSession = async (api: any) => {
  const signInResponse = (await api.signIn({
    email: globalTestEmail!,
    password: globalTestPassword!,
  })) as any;

  if (signInResponse?.status !== 200) {
    throw new Error(
      `로그인 실패: ${signInResponse?.status || "unknown status"}`
    );
  }

  const setCookieHeader =
    signInResponse.headers?.["set-cookie"] ||
    signInResponse.headers?.["Set-Cookie"];
  const sessionCookie = extractSessionCookie(setCookieHeader);

  if (!sessionCookie) {
    throw new Error("로그인 응답에 세션 쿠키가 없습니다.");
  }

  setSessionCookie(sessionCookie);

  if (!globalTestMemberId && signInResponse?.data) {
    if (
      signInResponse.data &&
      typeof signInResponse.data === "object" &&
      "data" in signInResponse.data &&
      signInResponse.data.data?.id
    ) {
      globalTestMemberId = signInResponse.data.data.id;
    } else if (signInResponse.data && "id" in signInResponse.data) {
      globalTestMemberId = signInResponse.data.id;
    }
  }

  setSharedTestAccount({
    email: globalTestEmail!,
    password: globalTestPassword!,
    name: globalTestName!,
    memberId: globalTestMemberId,
  });

  saveAccountToEnvironment(
    globalTestEmail!,
    globalTestPassword!,
    globalTestName!,
    globalTestMemberId
  );

  if (typeof process !== "undefined") {
    process.env.SESSION_COOKIE = sessionCookie;
  }

  console.log(
    `[INFO] 전역 테스트 세션 생성 완료 - 계정: ${globalTestEmail}, 쿠키: ${sessionCookie.substring(
      0,
      30
    )}...`
  );
};

const signInAdminAndSaveSession = async (api: any) => {
  const signInResponse = (await api.signIn({
    email: adminTestEmail!,
    password: adminTestPassword!,
  })) as any;

  if (signInResponse?.status !== 200) {
    throw new Error(
      `관리자 로그인 실패: ${signInResponse?.status || "unknown status"}`
    );
  }

  saveAdminAccountToEnvironment(
    adminTestEmail!,
    adminTestPassword!,
    adminTestName!,
    adminTestMemberId
  );

  const setCookieHeader =
    signInResponse.headers?.["set-cookie"] ||
    signInResponse.headers?.["Set-Cookie"];
  const sessionCookie = extractSessionCookie(setCookieHeader);

  if (!sessionCookie) {
    throw new Error("관리자 로그인 응답에 세션 쿠키가 없습니다.");
  }

  if (typeof process !== "undefined") {
    process.env.ADMIN_SESSION_COOKIE = sessionCookie;
  }

  console.log(
    `[INFO] 관리자 테스트 세션 생성 완료 - 계정: ${adminTestEmail}, 쿠키: ${sessionCookie.substring(
      0,
      30
    )}...`
  );
};

export const initializeGlobalTestSession = async () => {
  if (!INTEGRATION_TEST_ENABLED) {
    return;
  }

  if (globalSessionInitialized) {
    await globalSessionInitialized;
    return;
  }

  globalSessionInitialized = new Promise<void>((resolve) => {
    globalSessionInitializedResolve = resolve;
  });

  const api = getGregoriApi();

  try {
    if (process.env.SESSION_COOKIE) {
      console.log("[INFO] 전역 테스트 세션이 환경 변수로 설정되어 있습니다.");

      const account = loadAccountFromEnvironment();
      if (account) {
        console.log(`[INFO] 환경 변수에서 계정 정보 로드: ${account.email}`);
        setSessionCookie(process.env.SESSION_COOKIE);
        if (globalSessionInitializedResolve) {
          globalSessionInitializedResolve();
          globalSessionInitializedResolve = null;
        }
        return;
      }

      console.log(
        "[WARN] INTEGRATION_TEST_EMAIL 또는 INTEGRATION_TEST_PASSWORD가 설정되지 않았습니다. 새 계정을 생성합니다."
      );
    }

    await createNewTestAccount(api);
    await signInAndSaveSession(api);
  } catch (error: any) {
    console.error(
      `[ERROR] 전역 테스트 세션 생성 실패: ${error.message}`,
      error.response?.data
    );
    throw error;
  } finally {
    if (globalSessionInitializedResolve) {
      globalSessionInitializedResolve();
      globalSessionInitializedResolve = null;
    }
  }
};

export const initializeAdminTestSession = async () => {
  if (!INTEGRATION_TEST_ENABLED) {
    return;
  }

  if (adminSessionInitialized) {
    await adminSessionInitialized;
    return;
  }

  adminSessionInitialized = new Promise<void>((resolve) => {
    adminSessionInitializedResolve = resolve;
  });

  const api = getGregoriApi();

  try {
    loadAdminAccountFromEnvironment();
    await signInAdminAndSaveSession(api);
  } catch (error: any) {
    console.error(
      `[ERROR] 관리자 테스트 세션 생성 실패: ${error.message}`,
      error.response?.data
    );
    throw error;
  } finally {
    if (adminSessionInitializedResolve) {
      adminSessionInitializedResolve();
      adminSessionInitializedResolve = null;
    }
  }
};

export const waitForGlobalSession = async (): Promise<void> => {
  if (globalSessionInitialized) {
    await globalSessionInitialized;
  } else {
    await initializeGlobalTestSession();
  }
};

export const waitForAdminSession = async (): Promise<void> => {
  if (adminSessionInitialized) {
    await adminSessionInitialized;
  }
};

export const getGlobalTestAccount = () => {
  if (globalTestEmail && globalTestPassword) {
    return {
      email: globalTestEmail,
      password: globalTestPassword,
      name: globalTestName,
      memberId: globalTestMemberId,
    };
  }

  const envAccount = getAccountFromEnvironment();
  if (envAccount) {
    globalTestEmail = envAccount.email;
    globalTestPassword = envAccount.password;
    globalTestName = envAccount.name;
    globalTestMemberId = envAccount.memberId;
    return envAccount;
  }

  return {
    email: globalTestEmail,
    password: globalTestPassword,
    name: globalTestName,
    memberId: globalTestMemberId,
  };
};

const getAccountFromEnvironment = () => {
  const envEmail = process.env.INTEGRATION_TEST_EMAIL;
  const envPassword = process.env.INTEGRATION_TEST_PASSWORD;

  if (!envEmail || !envPassword) {
    return null;
  }

  return {
    email: envEmail,
    password: envPassword,
    name: process.env.INTEGRATION_TEST_NAME || "전역테스트",
    memberId: process.env.INTEGRATION_TEST_MEMBER_ID
      ? parseInt(process.env.INTEGRATION_TEST_MEMBER_ID, 10)
      : null,
  };
};

export const getTestAccount = () => {
  const sharedAccount = getSharedTestAccount();
  if (sharedAccount?.email && sharedAccount?.password) {
    return {
      email: sharedAccount.email,
      password: sharedAccount.password,
      name: sharedAccount.name,
      memberId: sharedAccount.memberId,
    };
  }

  const globalTestAccount = getGlobalTestAccount();
  if (globalTestAccount?.email && globalTestAccount?.password) {
    return globalTestAccount;
  }

  return getAccountFromEnvironment();
};
