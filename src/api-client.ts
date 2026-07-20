const GITHUB_PAGES_HOST = "mongonsh.github.io";
const ALIBABA_API_BASE_URL =
  "https://quotex-utopilot-vybltedhtp.ap-northeast-1.fcapp.run";
const ACCESS_QUERY_PARAMETER = "access";
const ACCESS_SESSION_KEY = "quotex:cloud-access-token";

let volatileAccessToken = "";

export function apiBaseUrlForHostname(hostname: string): string {
  return hostname.trim().toLowerCase() === GITHUB_PAGES_HOST
    ? ALIBABA_API_BASE_URL
    : "";
}

export function resolveQuoteXApiUrl(path: string, hostname = browserHostname()): string {
  if (!path.startsWith("/api/")) return path;
  const baseUrl = apiBaseUrlForHostname(hostname);
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function accessTokenFromUrl(href: string): string {
  try {
    const url = new URL(href);
    const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ""));
    return cleanAccessToken(
      hashParameters.get(ACCESS_QUERY_PARAMETER) ||
        url.searchParams.get(ACCESS_QUERY_PARAMETER)
    );
  } catch {
    return "";
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isApiRequest = path.startsWith("/api/");
  const headers = new Headers(init.headers);
  const token = isApiRequest ? readBrowserAccessToken() : "";

  if (token) headers.set("X-QuoteX-Access-Token", token);

  return fetch(resolveQuoteXApiUrl(path), {
    ...init,
    headers
  });
}

function readBrowserAccessToken(): string {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  const fromUrl = accessTokenFromUrl(url.href);
  if (fromUrl) {
    volatileAccessToken = fromUrl;
    try {
      window.sessionStorage.setItem(ACCESS_SESSION_KEY, fromUrl);
    } catch {
      // The in-memory value keeps this tab usable when session storage is blocked.
    }

    url.searchParams.delete(ACCESS_QUERY_PARAMETER);
    const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ""));
    hashParameters.delete(ACCESS_QUERY_PARAMETER);
    url.hash = hashParameters.size ? `#${hashParameters.toString()}` : "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    return fromUrl;
  }

  if (volatileAccessToken) return volatileAccessToken;

  try {
    volatileAccessToken = cleanAccessToken(
      window.sessionStorage.getItem(ACCESS_SESSION_KEY)
    );
  } catch {
    volatileAccessToken = "";
  }
  return volatileAccessToken;
}

function cleanAccessToken(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 512) : "";
}

function browserHostname(): string {
  return typeof window === "undefined" ? "" : window.location.hostname;
}
