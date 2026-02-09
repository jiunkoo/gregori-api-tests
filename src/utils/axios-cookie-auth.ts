import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

export type SessionKind = "general" | "admin";

const sessionCookies: { general: string | null; admin: string | null } = {
  general: null,
  admin: null,
};

let currentSession: SessionKind | null = "general";

const getCookie = (): string | null => {
  const fromStore =
    currentSession === "admin"
      ? sessionCookies.admin
      : sessionCookies.general;
  if (fromStore) return fromStore;
  if (currentSession === "admin" && process.env.ADMIN_MEMBER_SESSION_COOKIE)
    return process.env.ADMIN_MEMBER_SESSION_COOKIE;
  if (process.env.GENERAL_MEMBER_SESSION_COOKIE)
    return process.env.GENERAL_MEMBER_SESSION_COOKIE;
  if (process.env.ADMIN_MEMBER_SESSION_COOKIE)
    return process.env.ADMIN_MEMBER_SESSION_COOKIE;
  return null;
};

/** Set-Cookie 헤더에서 쿠키 값만 추출 (name=value; name2=value2 형태) */
export const extractCookieValue = (
  setCookieHeader: string | string[]
): string | null => {
  if (!setCookieHeader) return null;

  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];

  const cookieStrings: string[] = [];

  for (const cookie of cookies) {
    const parts = cookie.split(";");
    if (parts.length > 0) {
      const nameValue = parts[0].trim();
      if (nameValue) {
        cookieStrings.push(nameValue);
      }
    }
  }

  return cookieStrings.length > 0 ? cookieStrings.join("; ") : null;
};

const formatCookieHeader = (cookie: string): string => {
  if (
    !cookie.includes("Path=") &&
    !cookie.includes("HttpOnly") &&
    !cookie.includes("Secure")
  ) {
    return cookie;
  }

  return extractCookieValue(cookie) || cookie;
};

export const setGeneralSessionCookie = (cookie: string | null) => {
  sessionCookies.general = cookie;
};

export const setAdminSessionCookie = (cookie: string | null) => {
  sessionCookies.admin = cookie;
};

export const setCurrentSession = (kind: SessionKind | null) => {
  currentSession = kind;
};

export const setSessionCookie = (cookie: string | null) => {
  sessionCookies.general = cookie;
  currentSession = "general";
};

export const getSessionCookie = (): string | null => {
  return getCookie();
};

export const clearSessionCookie = () => {
  sessionCookies.general = null;
  sessionCookies.admin = null;
  currentSession = "general";
};

export const setupCookieAuth = (axiosInstance: AxiosInstance) => {
  axiosInstance.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const cookie = getCookie();
    if (!cookie) return cfg;

    const url = cfg.url || "";
    const isSignInEndpoint = url.includes("/auth/signin");

    if (isSignInEndpoint) return cfg;

    const hasCookie =
      !!(cfg.headers as any)?.Cookie || !!(cfg.headers as any)?.cookie;
    const skip =
      cfg.headers?.["x-skip-auth"] === true ||
      cfg.headers?.["x-skip-auth"] === "true";

    if (!skip && !hasCookie) {
      const cookieValue = formatCookieHeader(cookie);
      cfg.headers = {
        ...(cfg.headers as any),
        Cookie: cookieValue,
      };
    }
    return cfg;
  });

  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error) => {
      return Promise.reject(error);
    }
  );
};

const wrapTargetMethods = (target: any) => {
  const wrap = (name: "post" | "get" | "put" | "delete" | "patch") => {
    const fn = target[name];
    if (!fn || typeof fn !== "function" || (fn as any).__cookieAuthWrapped)
      return;

    const wrapped = new Proxy(fn, {
      apply(orig, thisArg, args: [string, any?, AxiosRequestConfig?]) {
        const [url, data, cfg] = args;
        const cookie = getCookie();

        const isAuthEndpoint =
          url.includes("/auth/signin") || url.includes("/auth/signout");
        const hasCookie = !!cfg?.headers?.Cookie || !!cfg?.headers?.cookie;
        const skip =
          cfg?.headers?.["x-skip-auth"] === true ||
          cfg?.headers?.["x-skip-auth"] === "true";

        const nextCfg: AxiosRequestConfig =
          skip || hasCookie || !cookie || isAuthEndpoint
            ? { ...(cfg ?? {}) }
            : {
                ...(cfg ?? {}),
                headers: {
                  ...(cfg?.headers ?? {}),
                  Cookie: formatCookieHeader(cookie),
                },
              };

        return orig.apply(thisArg, [url, data, nextCfg]);
      },
    });

    (wrapped as any).__cookieAuthWrapped = true;
    target[name] = wrapped;
  };

  ["post", "get", "put", "delete", "patch"].forEach((m) => wrap(m as any));
};

export const wrapMockedAxiosCookieAuth = (mockedAxios: any) => {
  if (!mockedAxios) return;

  wrapTargetMethods(mockedAxios);

  const origCreate = mockedAxios.create;
  if (
    typeof origCreate === "function" &&
    !(origCreate as any).__cookieAuthCreatePatched
  ) {
    const wrappedCreate = new Proxy(origCreate, {
      apply(target, thisArg, args: any[]) {
        const instance = target.apply(thisArg, args);
        if (instance) wrapTargetMethods(instance);
        return instance;
      },
    });
    (wrappedCreate as any).__cookieAuthCreatePatched = true;
    mockedAxios.create = wrappedCreate;
  }
};

const ensureCookieAuthWrapped = async () => {
  const vi = (globalThis as any)?.vi;
  if (!vi) return;
  const mocked = vi.mocked((await import("axios")).default, true);
  if (mocked) wrapMockedAxiosCookieAuth(mocked);
};

export const installAxiosCookieAuthAutoWrap = () => {
  const vi = (globalThis as any)?.vi;
  const beforeAll = (globalThis as any)?.beforeAll;
  const beforeEach = (globalThis as any)?.beforeEach;
  if (!vi || !beforeAll || !beforeEach) return;

  beforeAll(async () => {
    await ensureCookieAuthWrapped();
    queueMicrotask(() => {
      void ensureCookieAuthWrapped();
    });
  });

  beforeEach(async () => {
    await ensureCookieAuthWrapped();
  });

  const _clear = vi.clearAllMocks?.bind(vi);
  if (_clear && !(vi as any).__cookieAuthPatchedClear) {
    (vi as any).__cookieAuthPatchedClear = true;
    vi.clearAllMocks = function () {
      const r = _clear();
      void ensureCookieAuthWrapped();
      queueMicrotask(() => {
        void ensureCookieAuthWrapped();
      });
      return r;
    };
  }
};

const COOKIE_AUTH_AUTOWRAP =
  String(process.env.COOKIE_AUTH_AUTOWRAP ?? "false").toLowerCase() === "true";
(() => {
  const isVitest = !!(globalThis as any).vi;
  if (isVitest && COOKIE_AUTH_AUTOWRAP) installAxiosCookieAuthAutoWrap();
})();
