import { withApiHandler } from "@/lib/api/handler";
import { env } from "@/lib/env";

export const GET = withApiHandler({ auth: false, route: "GET /api/health" }, async () => ({
  status: "ok" as const,
  db: "unknown" as const,
  ai: env.GEMINI_API_KEY ? ("configured" as const) : ("missing" as const),
  time: new Date().toISOString(),
}));
