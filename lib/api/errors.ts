import { z } from "zod";

export const HTTP_STATUS_BY_CODE = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  AI_NOT_CONFIGURED: 503,
  AI_RATE_LIMITED: 429,
  AI_TIMEOUT: 504,
  AI_PROVIDER_ERROR: 502,
  AI_INVALID_RESPONSE: 502,
  DB_ERROR: 500,
  INTERNAL_ERROR: 500,
} as const;

export type AppErrorCode = keyof typeof HTTP_STATUS_BY_CODE;

export type AppErrorOptions = {
  status?: number;
  details?: unknown;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? HTTP_STATUS_BY_CODE[code];
    this.details = options.details;
  }
}

export const RPC_ERROR_CODE_MAP: Record<string, AppErrorCode> = {
  TASK_NOT_FOUND: "NOT_FOUND",
  MEETING_NOT_FOUND: "NOT_FOUND",
  ALREADY_COMMITTED_OR_NOT_FOUND: "CONFLICT",
  INVALID_TRANSITION: "UNPROCESSABLE",
  REASON_REQUIRED: "UNPROCESSABLE",
  OUTCOME_REQUIRED: "UNPROCESSABLE",
  NO_CHANGE: "UNPROCESSABLE",
};

const SUPABASE_ERROR_CODE_MAP: Record<string, AppErrorCode> = {
  PGRST116: "NOT_FOUND",
  PGRST301: "UNAUTHENTICATED",
  "42501": "FORBIDDEN",
  "23505": "CONFLICT",
  "23503": "DB_ERROR",
  "22P02": "VALIDATION_ERROR",
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function isSupabaseLikeError(value: unknown): value is SupabaseLikeError {
  return typeof value === "object" && value !== null && ("code" in value || "message" in value);
}

export function mapError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof z.ZodError) {
    return new AppError("VALIDATION_ERROR", "Request validation failed.", { details: error.issues });
  }
  if (isSupabaseLikeError(error)) {
    const rawCode = error.code ?? "";
    const rpcCode = Object.entries(RPC_ERROR_CODE_MAP).find(([candidate]) => error.message?.includes(candidate))?.[1];
    const mappedCode = rpcCode ?? SUPABASE_ERROR_CODE_MAP[rawCode];
    if (mappedCode) {
      const details = mappedCode === "DB_ERROR" ? undefined : error.details;
      return new AppError(mappedCode, mappedCode === "DB_ERROR" ? "Database operation failed." : error.message ?? mappedCode, {
        details,
        cause: error,
      });
    }
  }
  return new AppError("INTERNAL_ERROR", "An unexpected error occurred.", { cause: error });
}
