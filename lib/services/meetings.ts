import type { Logger } from "pino";
import { AppError, mapError } from "@/lib/api/errors";
import { LOG_EVENTS } from "@/lib/log-events";
import type { CommitInput, MeetingInput, MeetingPatch } from "@/lib/validations/meetings";
import type { Database, Json, MeetingRow, ProfileRow } from "@/types/db";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;
type MeetingSummaryRow = Omit<MeetingRow, "raw_notes" | "search" | "decisions" | "risks" | "open_questions"> & {
  decisions?: Json; risks?: Json; open_questions?: Json;
};

function fail(error: { code?: string; message?: string; details?: string } | null, message: string): void {
  if (error) throw new AppError("DB_ERROR", message, { cause: error });
}

async function ensureProfiles(client: Client, ids: string[]): Promise<ProfileRow[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  const { data, error } = await client.from("profiles").select("*").in("id", uniqueIds);
  fail(error, "Meeting participants could not be validated.");
  if ((data?.length ?? 0) !== uniqueIds.length) throw new AppError("VALIDATION_ERROR", "One or more selected participants are not team members.");
  return data ?? [];
}

export async function listMeetings(client: Client, query: { q?: string; limit: number; cursor?: string }) {
  let request = client.from("meetings")
    .select("id,title,meeting_date,agenda,summary,decisions,risks,open_questions,extraction_status,ai_generated,created_by,created_at,updated_at")
    .order("created_at", { ascending: false }).limit(query.limit);
  if (query.q) request = request.ilike("title", `%${query.q.replace(/[%_]/g, "\\$&")}%`);
  if (query.cursor) request = request.lt("created_at", query.cursor);
  const { data, error } = await request;
  fail(error, "Meetings could not be loaded.");
  return (data ?? []) as MeetingSummaryRow[];
}

export async function createMeeting(client: Client, userId: string, input: MeetingInput, log: Logger): Promise<MeetingRow> {
  const participants = await ensureProfiles(client, input.participant_ids);
  const { data, error } = await client.from("meetings").insert({
    title: input.title, meeting_date: input.meeting_date, agenda: input.agenda ?? null,
    raw_notes: input.raw_notes ?? null, created_by: userId,
  }).select("*").single();
  if (error || !data) throw new AppError("DB_ERROR", "Meeting could not be saved.", { cause: error });
  if (participants.length) {
    const { error: participantError } = await client.from("meeting_participants").insert(
      participants.map((profile) => ({ meeting_id: data.id, user_id: profile.id, attendance_status: "attended" as const })),
    );
    if (participantError) {
      await client.from("meetings").delete().eq("id", data.id);
      throw mapError(participantError);
    }
  }
  log.info({ event: LOG_EVENTS.MEETING_CREATED, meetingId: data.id }, "meeting created");
  return data;
}

export async function getMeeting(client: Client, meetingId: string) {
  const { data: meeting, error } = await client.from("meetings").select("*").eq("id", meetingId).maybeSingle();
  if (error) throw new AppError("DB_ERROR", "Meeting could not be loaded.", { cause: error });
  if (!meeting) throw new AppError("NOT_FOUND", "Meeting not found.");
  const [participantRows, taskResult] = await Promise.all([
    client.from("meeting_participants").select("user_id,attendance_status").eq("meeting_id", meetingId),
    client.from("action_items").select("id,display_id,title,description,owner_id,due_date,priority,status,created_at,updated_at")
      .eq("meeting_id", meetingId).order("created_at", { ascending: true }),
  ]);
  fail(participantRows.error, "Meeting participants could not be loaded.");
  fail(taskResult.error, "Meeting action items could not be loaded.");
  const ids = (participantRows.data ?? []).map((participant) => participant.user_id);
  const ownerIds = (taskResult.data ?? []).flatMap((task) => task.owner_id ? [task.owner_id] : []);
  const profilesResult = [...new Set([...ids, ...ownerIds])].length
    ? await client.from("profiles").select("id,name,email,role,created_at").in("id", [...new Set([...ids, ...ownerIds])])
    : { data: [], error: null };
  fail(profilesResult.error, "Meeting team members could not be loaded.");
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  return {
    ...meeting,
    participants: (participantRows.data ?? []).map((participant) => ({
      ...(profiles.get(participant.user_id) ?? { id: participant.user_id, name: "Team member", email: "", role: "member" as const }),
      attendance_status: participant.attendance_status,
    })),
    tasks: (taskResult.data ?? []).map((task) => ({ ...task, owner: task.owner_id ? profiles.get(task.owner_id) ?? null : null })),
  };
}

export async function updateMeeting(client: Client, meetingId: string, input: MeetingPatch, log: Logger): Promise<MeetingRow> {
  const { participant_ids, ...updates } = input;
  if (participant_ids) await ensureProfiles(client, participant_ids);
  const { data, error } = await client.from("meetings").update(updates).eq("id", meetingId).select("*").maybeSingle();
  if (error) throw new AppError("DB_ERROR", "Meeting could not be updated.", { cause: error });
  if (!data) throw new AppError("NOT_FOUND", "Meeting not found.");
  if (participant_ids) {
    const { error: deleteError } = await client.from("meeting_participants").delete().eq("meeting_id", meetingId);
    fail(deleteError, "Meeting participants could not be updated.");
    if (participant_ids.length) {
      const { error: insertError } = await client.from("meeting_participants").insert(
        [...new Set(participant_ids)].map((user_id) => ({ meeting_id: meetingId, user_id, attendance_status: "attended" as const })),
      );
      fail(insertError, "Meeting participants could not be updated.");
    }
  }
  log.info({ event: LOG_EVENTS.MEETING_UPDATED, meetingId }, "meeting updated");
  return data;
}

export async function commitMeeting(client: Client, meetingId: string, input: CommitInput, log: Logger) {
  const items = input.action_items.map((item) => ({
    ...item, description: item.description ?? null, owner_id: item.owner_id, due_date: item.due_date,
  })) satisfies Json[];
  const { data: result, error } = await client.rpc("commit_meeting_extraction", {
    p_meeting_id: meetingId, p_summary: input.summary,
    p_decisions: input.decisions as Json, p_risks: input.risks as Json,
    p_open_questions: input.open_questions as Json, p_items: items,
    p_ai_generated: input.ai_generated,
  });
  if (error) throw mapError(error);
  const taskIds = (result as { task_ids?: string[] } | null)?.task_ids ?? [];
  const [meetingResult, tasksResult] = await Promise.all([
    client.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
    taskIds.length ? client.from("action_items").select("*").in("id", taskIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (meetingResult.error || !meetingResult.data) throw new AppError("DB_ERROR", "Meeting was committed but could not be reloaded.", { cause: meetingResult.error });
  fail(tasksResult.error, "Committed tasks could not be loaded.");
  log.info({ event: LOG_EVENTS.EXTRACTION_COMMITTED, meetingId, taskCount: taskIds.length }, "meeting extraction committed");
  return { meeting: meetingResult.data, tasks: tasksResult.data ?? [] };
}
