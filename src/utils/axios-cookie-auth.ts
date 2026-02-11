import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

export type SessionKind = "general" | "admin";
export const SESSION_KIND_HEADER = "x-session-kind";

const sessionCookies: Record<SessionKind, string | null> = {
  general: null,
  admin: null,
};

let defaultSessionKind: SessionKind | null = "general";

const COOKIE_AUTH_INSTALLED = Symbol.for("cookieAuthInstalled");

const isSessionKind = (v: unknown): v is SessionKind =>
  v === "general" || v === "admin";

const readSessionKindFromHeaders = (headers: any): SessionKind | undefined => {
  const raw = headers?.[SESSION_KIND_HEADER];
  return isSessionKind(raw) ? raw : undefined;
};

const stripInternalHeaders = (headers: any) => {
  const next = { ...(headers ?? {}) };
  delete next[SESSION_KIND_HEADER];
  return next;
};

const getCookieForKind = (kind: SessionKind | null): string | null => {
  if (kind === null) return null;

  if (kind === "admin") {
    return (
      sessionCookies.admin ??
      process.env.ADMIN_MEMBER_SESSION_COOKIE ??
      null
    );
  }

  return (
    sessionCookies.general ??
    process.env.GENERAL_MEMBER_SESSION_COOKIE ??
    null
  );
};

const getCookie = (kind?: SessionKind | null): string | null => {
  const k = kind ?? defaultSessionKind;
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
    const nameValue = cookie.split(";")[0]?.trim();
    if (!nameValue) continue;
    cookieStrings.push(nameValue);
  }

  return cookieStrings.length ? cookieStrings.join("; ") : null;
};

const formatCookieHeader = (cookie: string): string => {
  const looksLikeSetCookie =
    cookie.includes("Path=") || cookie.includes("HttpOnly") || cookie.includes("Secure");

  if (!looksLikeSetCookie) return cookie;
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

export const getSessionCookie = (): string | null => getCookie();

export const clearSessionCookie = () => {
  sessionCookies.general = null;
  sessionCookies.admin = null;
  defaultSessionKind = "general";
};

export const setupCookieAuth = (axiosInstance: AxiosInstance) => {
  if ((axiosInstance as any)[COOKIE_AUTH_INSTALLED]) return;
  (axiosInstance as any)[COOKIE_AUTH_INSTALLED] = true;

  axiosInstance.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const kind = readSessionKindFromHeaders(cfg.headers);
    const headers = stripInternalHeaders(cfg.headers);
    cfg.headers = headers;

    const cookie = getCookie(kind);
    if (!cookie) return cfg;

    const url = cfg.url || "";
    if (url.includes("/auth/signin")) return cfg;

    const skip =
      headers["x-skip-auth"] === true || headers["x-skip-auth"] === "true";
    if (skip) return cfg;

    const hasCookie = !!headers.Cookie || !!headers.cookie;
    if (hasCookie) return cfg;

    cfg.headers = { ...headers, Cookie: formatCookieHeader(cookie) };
    return cfg;
  });

  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error) => Promise.reject(error)
  );
};

const wrapTargetMethods = (target: any) => {
  const buildCookieConfig = (
    url: string,
    cfg?: AxiosRequestConfig
  ): AxiosRequestConfig => {
    const headers = stripInternalHeaders(cfg?.headers);

    const kind = readSessionKindFromHeaders(cfg?.headers);
    const cookie = getCookie(kind);
    if (!cookie) return { ...(cfg ?? {}), headers };

    const isAuthEndpoint =
      url.includes("/auth/signin") || url.includes("/auth/signout");
    if (isAuthEndpoint) return { ...(cfg ?? {}), headers };

    const skip =
      headers["x-skip-auth"] === true || headers["x-skip-auth"] === "true";
    if (skip) return { ...(cfg ?? {}), headers };

    const hasCookie = !!headers.Cookie || !!headers.cookie;
    if (hasCookie) return { ...(cfg ?? {}), headers };

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

        if (isGetOrDelete) {
          const cfg = args.length >= 2 ? args[1] : {};
          return orig.apply(thisArg, [url, buildCookieConfig(url, cfg)]);
        }

        const data = args.length >= 2 ? args[1] : null;
        const cfg = args.length >= 3 ? args[2] : {};
        return orig.apply(thisArg, [url, data, buildCookieConfig(url, cfg)]);
      },
    });

    (wrapped as any).__cookieAuthWrapped = true;
    target[name] = wrapped;
  };

  (["post", "get", "put", "delete", "patch"] as const).forEach(wrap);
};

export const wrapMockedAxiosCookieAuth = (mockedAxios: any) => {
  if (!mockedAxios) return;

  wrapTargetMethods(mockedAxios);

  const origCreate = mockedAxios.create;
  if (typeof origCreate !== "function") return;
  if ((origCreate as any).__cookieAuthCreatePatched) return;

  const wrappedCreate = new Proxy(origCreate, {
    apply(target, thisArg, args: any[]) {
      const instance = target.apply(thisArg, args);
      if (instance) wrapTargetMethods(instance);
      return instance;
    },
  });

  (wrappedCreate as any).__cookieAuthCreatePatched = true;
  mockedAxios.create = wrappedCreate;
};

const ensureCookieAuthWrapped = async () => {
  const vi = (globalThis as any)?.vi;
  if (!vi) return;

  const mocked = vi.mocked((await import("axios")).default, true);
  if (!mocked) return;

  wrapMockedAxiosCookieAuth(mocked);
};

export const installAxiosCookieAuthAutoWrap = () => {
  const vi = (globalThis as any)?.vi;
  const beforeAll = (globalThis as any)?.beforeAll;
  const beforeEach = (globalThis as any)?.beforeEach;
  if (!vi || !beforeAll || !beforeEach) return;

  beforeAll(async () => {
    await ensureCookieAuthWrapped();
    queueMicrotask(() => void ensureCookieAuthWrapped());
  });

  beforeEach(async () => {
    await ensureCookieAuthWrapped();
  });

  const clear = vi.clearAllMocks?.bind(vi);
  if (!clear || (vi as any).__cookieAuthPatchedClear) return;

  (vi as any).__cookieAuthPatchedClear = true;
  vi.clearAllMocks = function () {
    const r = clear();
    void ensureCookieAuthWrapped();
    queueMicrotask(() => void ensureCookieAuthWrapped());
    return r;
  };
};

const COOKIE_AUTH_AUTOWRAP =
  String(process.env.COOKIE_AUTH_AUTOWRAP ?? "false").toLowerCase() === "true";

(() => {
  const isVitest = !!(globalThis as any).vi;
  if (!isVitest || !COOKIE_AUTH_AUTOWRAP) return;
  installAxiosCookieAuthAutoWrap();
})();
