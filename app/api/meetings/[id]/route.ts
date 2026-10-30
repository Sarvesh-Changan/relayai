import { withApiHandler } from "@/lib/api/handler";
import { getMeeting, updateMeeting } from "@/lib/services/meetings";
import { MeetingIdParams, MeetingPatchBody } from "@/lib/validations/meetings";

export const GET = withApiHandler({ auth: true, params: MeetingIdParams, route: "GET /api/meetings/:id" }, async ({ supabase, params }) => {
  if (!supabase) throw new Error("Authenticated Supabase client was not provided.");
  return getMeeting(supabase, params.id);
});

export const PATCH = withApiHandler({ auth: true, params: MeetingIdParams, body: MeetingPatchBody, route: "PATCH /api/meetings/:id" }, async ({ supabase, params, body, log }) => {
  if (!supabase) throw new Error("Authenticated Supabase client was not provided.");
  return updateMeeting(supabase, params.id, body, log);
});
