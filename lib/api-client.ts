"use client";

export type ApiClientErrorDetails = unknown;

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly details?: ApiClientErrorDetails;

  constructor(code: string, message: string, requestId: string, details?: ApiClientErrorDetails) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

type ApiEnvelope<T> = { data: T } | { error: { code: string; message: string; requestId: string; details?: unknown } };

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const requestId = response.headers.get("x-request-id") ?? "unknown";
  const payload = (await response.json().catch(() => undefined)) as ApiEnvelope<T> | undefined;
  if (!response.ok || !payload || !("data" in payload)) {
    const error = payload && "error" in payload ? payload.error : undefined;
    throw new ApiClientError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "The request failed.",
      error?.requestId ?? requestId,
      error?.details,
    );
  }
  return payload.data;
}
