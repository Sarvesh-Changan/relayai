import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { commitMeeting } from "@/lib/services/meetings";
import { CommitBody, MeetingIdParams } from "@/lib/validations/meetings";

export const POST = withApiHandler({ auth: true, params: MeetingIdParams, body: CommitBody, route: "POST /api/meetings/:id/commit" }, async ({ supabase, params, body, log, requestId }) => {
  if (!supabase) throw new Error("Authenticated Supabase client was not provided.");
  const result = await commitMeeting(supabase, params.id, body, log);
  return successResponse(result, 201, requestId);
});
