export function normalizePublicAppUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const url = new URL(value.trim());
    const isLocalHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !isLocalHttp) return "";
    if (url.username || url.password) return "";

    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function buildPublicAppRedirect(
  publicAppUrl: string,
  accessToken = ""
): string {
  const normalized = normalizePublicAppUrl(publicAppUrl);
  if (!normalized) return "";

  const target = new URL(normalized);
  const token = accessToken.trim().slice(0, 512);
  if (token) {
    target.hash = new URLSearchParams({ access: token }).toString();
  }
  return target.toString();
}
