import { AppError } from "@/lib/api/errors";
import { withApiHandler } from "@/lib/api/handler";

export const GET = withApiHandler({ auth: true, route: "GET /api/team" }, async ({ supabase }) => {
  if (!supabase) throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  const { data, error } = await supabase.from("profiles").select("id,name,email,role").order("name");
  if (error) throw new AppError("DB_ERROR", "Team directory could not be loaded.", { cause: error });
  return data;
});
