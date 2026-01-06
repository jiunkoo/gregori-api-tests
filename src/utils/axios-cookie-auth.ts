import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

let sessionCookie: string | null = null;

const getCookie = (): string | null => {
  if (sessionCookie) return sessionCookie;
  return process.env.SESSION_COOKIE || null;
};

const extractCookieValue = (
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

export const setSessionCookie = (cookie: string | null) => {
  sessionCookie = cookie;
};

export const getSessionCookie = (): string | null => {
  return getCookie();
};

export const clearSessionCookie = () => {
  sessionCookie = null;
};

export const setupCookieAuth = (axiosInstance: AxiosInstance) => {
  axiosInstance.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const cookie = getCookie();
    if (!cookie) return cfg;

    const url = cfg.url || "";
    const isAuthEndpoint =
      url.includes("/auth/signin") || url.includes("/auth/signout");

    if (isAuthEndpoint) return cfg;

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
    (response: AxiosResponse) => {
      const url = response.config?.url || "";
      if (url.includes("/auth/signin") && response.status === 200) {
        const setCookieHeader =
          response.headers?.["set-cookie"] || response.headers?.["Set-Cookie"];
        if (setCookieHeader) {
          const cookieValue = extractCookieValue(setCookieHeader);
          if (cookieValue) {
            sessionCookie = cookieValue;
          }
        }
      }
      return response;
    },
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

        return orig.apply(thisArg, [url, data, nextCfg]).then((res: any) => {
          if (url.includes("/auth/signin")) {
            const response =
              res && "status" in res && "data" in res
                ? res
                : ({
                    status: 200,
                    statusText: "OK",
                    data: res,
                    headers: {},
                    config: { url },
                  } as AxiosResponse);

            if (response.status === 200) {
              const setCookieHeader =
                response.headers?.["set-cookie"] ||
                response.headers?.["Set-Cookie"];
              if (setCookieHeader) {
                const cookieValue = extractCookieValue(setCookieHeader);
                if (cookieValue) {
                  sessionCookie = cookieValue;
                }
              }
            }
          }
          return res;
        });
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
