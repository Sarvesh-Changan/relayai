import { withApiHandler } from "@/lib/api/handler";
import { env } from "@/lib/env";
import { LOG_EVENTS } from "@/lib/log-events";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withApiHandler({ auth: false, route: "GET /api/health" }, async ({ log }) => {
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
  if (error) log.warn({ event: LOG_EVENTS.DB_ERROR, code: error.code }, "health database check failed");

  return {
    status: "ok" as const,
    db: error ? ("down" as const) : ("ok" as const),
    ai: env.GEMINI_API_KEY ? ("configured" as const) : ("missing" as const),
    time: new Date().toISOString(),
  };
});
