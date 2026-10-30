import { NextResponse } from "next/server";

import { type AppError } from "@/lib/api/errors";

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

export function successResponse<T>(data: T, status = 200, requestId?: string): NextResponse {
  const headers = requestId ? { "x-request-id": requestId } : undefined;
  return NextResponse.json({ data }, { status, headers });
}

export function errorResponse(error: AppError, requestId: string): NextResponse<ErrorEnvelope> {
  const payload: ErrorEnvelope = {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  return NextResponse.json(payload, { status: error.status, headers: { "x-request-id": requestId } });
}
