import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createMeeting, listMeetings } from "@/lib/services/meetings";
import { MeetingBody, MeetingListQuery } from "@/lib/validations/meetings";

export const GET = withApiHandler({ auth: true, query: MeetingListQuery, route: "GET /api/meetings" }, async ({ supabase, query }) => {
  if (!supabase) throw new Error("Authenticated Supabase client was not provided.");
  return listMeetings(supabase, query);
});

export const POST = withApiHandler({ auth: true, body: MeetingBody, route: "POST /api/meetings" }, async ({ supabase, user, body, log, requestId }) => {
  if (!supabase || !user) throw new Error("Authenticated user was not provided.");
  const meeting = await createMeeting(supabase, user.id, body, log);
  return successResponse(meeting, 201, requestId);
});
