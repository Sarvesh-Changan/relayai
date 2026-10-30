import { withApiHandler } from "@/lib/api/handler";
import { getDashboardData } from "@/lib/services/dashboard";
import { env } from "@/lib/env";

export const GET = withApiHandler({ auth: true, route: "GET /api/dashboard" }, async ({ supabase }) => {
  if (!supabase) throw new Error("Authenticated Supabase client was not provided.");
  return getDashboardData(supabase, env.APP_TIMEZONE);
});
