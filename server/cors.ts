const DEFAULT_BROWSER_ORIGINS = ["https://mongonsh.github.io"];

export function parseCorsOrigins(value: string | undefined): ReadonlySet<string> {
  const configured = String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));

  return new Set([...DEFAULT_BROWSER_ORIGINS, ...configured]);
}

export function isCorsOriginAllowed(
  origin: string,
  allowedOrigins: ReadonlySet<string>
): boolean {
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && allowedOrigins.has(normalized));
}

export function buildCorsHeaders(
  origin: string,
  allowedOrigins: ReadonlySet<string>
): Record<string, string> {
  if (!isCorsOriginAllowed(origin, allowedOrigins)) return {};

  return {
    "Access-Control-Allow-Origin": normalizeOrigin(origin) || "",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Accept, Authorization, Content-Type, X-QuoteX-Access-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

function normalizeOrigin(value: string): string | null {
  if (!value || value === "*") return null;

  try {
    const url = new URL(value.trim());
    const isLocalHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !isLocalHttp) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

