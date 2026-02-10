import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

export type SessionKind = "general" | "admin";

export const SESSION_KIND_HEADER = "x-session-kind";

const sessionCookies: { general: string | null; admin: string | null } = {
  general: null,
  admin: null,
};

let defaultSessionKind: SessionKind | null = "general";

const getCookieForKind = (kind: SessionKind | null): string | null => {
  if (kind === null) return null;
  if (kind === "admin") {
    if (sessionCookies.admin) return sessionCookies.admin;
    if (process.env.ADMIN_MEMBER_SESSION_COOKIE)
      return process.env.ADMIN_MEMBER_SESSION_COOKIE;
    return null;
  }
  if (sessionCookies.general) return sessionCookies.general;
  if (process.env.GENERAL_MEMBER_SESSION_COOKIE)
    return process.env.GENERAL_MEMBER_SESSION_COOKIE;
  return null;
};

const getCookie = (kind?: SessionKind | null): string | null => {
  const k = kind ?? defaultSessionKind;
  if (k === null) return null;
  return getCookieForKind(k);
};

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
  defaultSessionKind = kind;
};

export const setSessionCookie = (cookie: string | null) => {
  sessionCookies.general = cookie;
  defaultSessionKind = "general";
};

export const getSessionCookie = (): string | null => {
  return getCookie();
};

export const clearSessionCookie = () => {
  sessionCookies.general = null;
  sessionCookies.admin = null;
  defaultSessionKind = "general";
};

const COOKIE_AUTH_INSTALLED = Symbol.for("cookieAuthInstalled");

export const setupCookieAuth = (axiosInstance: AxiosInstance) => {
  if ((axiosInstance as any)[COOKIE_AUTH_INSTALLED]) return;
  (axiosInstance as any)[COOKIE_AUTH_INSTALLED] = true;

  axiosInstance.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const rawKind = (cfg.headers as Record<string, unknown>)?.[SESSION_KIND_HEADER];
    const kind: SessionKind | undefined =
      rawKind === "admin" || rawKind === "general" ? rawKind : undefined;
    const headers = { ...(cfg.headers as any) };
    delete headers[SESSION_KIND_HEADER];
    cfg.headers = headers;

    const cookie = getCookie(kind);
    if (!cookie) return cfg;

    const url = cfg.url || "";
    const isSignInEndpoint = url.includes("/auth/signin");
    if (isSignInEndpoint) return cfg;

    const hasCookie = !!headers.Cookie || !!headers.cookie;
    const skip =
      headers["x-skip-auth"] === true || headers["x-skip-auth"] === "true";

    if (!skip && !hasCookie) {
      cfg.headers = { ...headers, Cookie: formatCookieHeader(cookie) };
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
  const buildCookieConfig = (
    url: string,
    cfg: AxiosRequestConfig | undefined
  ): AxiosRequestConfig => {
    const rawKind = (cfg?.headers as any)?.[SESSION_KIND_HEADER];
    const kind: SessionKind | undefined =
      rawKind === "admin" || rawKind === "general" ? rawKind : undefined;
    const headers = { ...(cfg?.headers ?? {}) } as any;
    delete headers[SESSION_KIND_HEADER];

    const cookie = getCookie(kind);
    const isAuthEndpoint =
      url.includes("/auth/signin") || url.includes("/auth/signout");
    const hasCookie = !!headers.Cookie || !!headers.cookie;
    const skip =
      headers["x-skip-auth"] === true || headers["x-skip-auth"] === "true";

    if (skip || hasCookie || !cookie || isAuthEndpoint) {
      return { ...(cfg ?? {}), headers };
    }
    return {
      ...(cfg ?? {}),
      headers: { ...headers, Cookie: formatCookieHeader(cookie) },
    };
  };

  const wrap = (name: "post" | "get" | "put" | "delete" | "patch") => {
    const fn = target[name];
    if (!fn || typeof fn !== "function" || (fn as any).__cookieAuthWrapped)
      return;

    const wrapped = new Proxy(fn, {
      apply(orig, thisArg, args: any[]) {
        const url = args[0];
        const isGetOrDelete = name === "get" || name === "delete";
        let cfg: AxiosRequestConfig | undefined;
        let data: any;

        if (isGetOrDelete) {
          cfg = args.length >= 2 ? args[1] : undefined;
          const nextCfg = buildCookieConfig(url, cfg);
          return orig.apply(thisArg, [url, nextCfg]);
        }
        data = args.length >= 2 ? args[1] : undefined;
        cfg = args.length >= 3 ? args[2] : undefined;
        const nextCfg = buildCookieConfig(url, cfg);
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
