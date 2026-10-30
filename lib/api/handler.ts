import { randomUUID } from "node:crypto";

import { type Logger } from "pino";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z, type ZodType } from "zod";

import { AppError, mapError } from "@/lib/api/errors";
import { errorResponse, successResponse } from "@/lib/api/response";
import { childLogger } from "@/lib/logger";
import { LOG_EVENTS } from "@/lib/log-events";
import { createClient } from "@/lib/supabase/server";
import type { Database, ProfileRow } from "@/types/db";
import type { SupabaseClient } from "@supabase/supabase-js";

type HandlerOptions<Body, Query, Params> = {
  auth?: boolean;
  body?: ZodType<Body>;
  query?: ZodType<Query>;
  params?: ZodType<Params>;
  route?: string;
};

export type ApiHandlerContext<Body, Query, Params> = {
  request: NextRequest;
  requestId: string;
  log: Logger;
  user: User | null;
  profile: ProfileRow | null;
  supabase: SupabaseClient<Database> | null;
  body: Body;
  query: Query;
  params: Params;
};

type RouteContext = { params: Promise<Record<string, string>> };
type HandlerResult = unknown;

function requestIdFor(request: NextRequest): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied || `req_${randomUUID()}`;
}

async function parseRequest<Body, Query, Params>(
  request: NextRequest,
  context: RouteContext,
  options: HandlerOptions<Body, Query, Params>,
): Promise<{ body: Body; query: Query; params: Params }> {
  const url = new URL(request.url);
  const queryInput = Object.fromEntries(url.searchParams.entries());
  const paramsInput = await context.params;
  const bodyInput = options.body ? await request.json().catch(() => undefined) : undefined;
  return {
    body: options.body ? options.body.parse(bodyInput) : (undefined as Body),
    query: options.query ? options.query.parse(queryInput) : (undefined as Query),
    params: options.params ? options.params.parse(paramsInput) : (undefined as Params),
  };
}

export function withApiHandler<Body = undefined, Query = undefined, Params = undefined>(
  options: HandlerOptions<Body, Query, Params>,
  fn: (context: ApiHandlerContext<Body, Query, Params>) => Promise<HandlerResult> | HandlerResult,
) {
  return async function apiHandler(request: NextRequest, routeContext: RouteContext): Promise<NextResponse> {
    const startedAt = Date.now();
    const requestId = requestIdFor(request);
    const route = options.route ?? new URL(request.url).pathname;
    let log = childLogger(requestId, { route, method: request.method });
    let status = 200;

    try {
      let user: User | null = null;
      let profile: ProfileRow | null = null;
      let supabase: SupabaseClient<Database> | null = null;
      if (options.auth !== false) {
        supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (!data.user) {
          log.warn({ event: LOG_EVENTS.AUTH_DENIED }, "authentication required");
          throw new AppError("UNAUTHENTICATED", "Authentication is required.", { cause: error });
        }
        user = data.user;
        log = childLogger(requestId, { route, method: request.method, userId: user.id });
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw mapError(profileError);
        if (!profileData) throw new AppError("UNAUTHENTICATED", "No RelayAI profile is associated with this account.");
        profile = profileData;
      }
      const parsed = await parseRequest(request, routeContext, options);
      const result = await fn({ request, requestId, log, user, profile, supabase, ...parsed });
      const response = result instanceof NextResponse ? result : successResponse(result, 200, requestId);
      status = response.status;
      return response;
    } catch (unknownError) {
      const error = mapError(unknownError);
      status = error.status;
      const event = error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN"
        ? LOG_EVENTS.AUTH_DENIED
        : error.code === "VALIDATION_ERROR"
          ? LOG_EVENTS.REQUEST_INVALID
          : error.code === "DB_ERROR"
            ? LOG_EVENTS.DB_ERROR
            : undefined;
      if (event) log.warn({ event, code: error.code }, "request failed");
      return errorResponse(error, requestId);
    } finally {
      log.info({ event: LOG_EVENTS.REQUEST_COMPLETED, status, durationMs: Date.now() - startedAt }, "request completed");
    }
  };
}

export const emptySchema = z.undefined();
