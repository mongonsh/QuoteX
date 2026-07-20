export interface AlibabaErrorSummary {
  code: string;
  message: string;
  statusCode?: number;
  requestId?: string;
  missingAction?: string;
  nextStep?: string;
}

export function summarizeAlibabaError(error: unknown): AlibabaErrorSummary {
  const source = asRecord(error);
  const data = asRecord(source.data);
  const denied = firstRecord(source.accessDeniedDetail, data.AccessDeniedDetail);
  const code = firstText(source.code, data.Code, source.name) || "AlibabaCloudError";
  const missingAction = firstText(denied.AuthAction);
  const requestId = firstText(source.requestId, data.RequestId);
  const statusCode = firstNumber(source.statusCode, source.status);
  const rawMessage =
    firstText(data.Message, source.message) || "Alibaba Cloud rejected the request.";
  const message = rawMessage.replace(/[,\s]*extra details:.*$/i, "").slice(0, 400);

  return {
    code,
    message,
    ...(statusCode ? { statusCode } : {}),
    ...(requestId ? { requestId } : {}),
    ...(missingAction ? { missingAction } : {}),
    ...(code === "AccessDenied"
      ? {
          nextStep: missingAction
            ? `Grant the temporary deployment RAM user permission for ${missingAction}, then retry.`
            : "Grant the temporary deployment RAM user the required service permission, then retry."
        }
      : {})
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function firstRecord(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length) return record;
  }
  return {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return undefined;
}
