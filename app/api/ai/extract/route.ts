import { AppError } from "@/lib/api/errors";
import { extractFromNotes } from "@/lib/ai/extract";
import { withApiHandler } from "@/lib/api/handler";
import { ExtractBody } from "@/lib/validations/meetings";

export const maxDuration = 60;

export const POST = withApiHandler({ auth: true, body: ExtractBody, route: "POST /api/ai/extract" }, async ({ supabase, user, body, requestId }) => {
  if (!supabase || !user) throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  const { data: allProfiles, error } = await supabase.from("profiles").select("id,name");
  if (error) throw new AppError("DB_ERROR", "Team profiles could not be loaded for extraction.", { cause: error });
  const profiles = allProfiles ?? [];
  const participantIds = [...new Set(body.participant_ids)];
  const participants = profiles.filter((profile) => participantIds.includes(profile.id));
  if (participants.length !== participantIds.length) throw new AppError("VALIDATION_ERROR", "One or more participants are not team members.");
  const { data: currentUser } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!currentUser) throw new AppError("UNAUTHENTICATED", "No RelayAI profile is associated with this account.");
  return extractFromNotes({
    title: body.title, meetingDate: body.meeting_date, notes: body.raw_notes,
    participants, allProfiles: profiles,
  }, { requestId, userId: user.id });
});
