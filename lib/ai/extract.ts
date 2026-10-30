import { AiExtraction, type AiExtractionType } from "@/lib/ai/schemas";
import { buildUserContent, RESPONSE_JSON_SCHEMA, SYSTEM_INSTRUCTION } from "@/lib/ai/prompts/extract";
import { generateStructured, type GenerateStructuredInput, type GenerateStructuredResult } from "@/lib/ai/gemini";
import type { ProfileRow } from "@/types/db";

export type ExtractionParticipant = Pick<ProfileRow, "id" | "name">;
export type ExtractionAction = AiExtractionType["action_items"][number] & {
  owner_id: string | null;
  needs_review: boolean;
  review_reasons: string[];
};
export type ExtractionResult = Omit<AiExtractionType, "action_items"> & {
  action_items: ExtractionAction[];
  meta: GenerateStructuredResult<AiExtractionType>["meta"];
};
export type ExtractInput = {
  title: string; meetingDate: string; notes: string;
  participants: ExtractionParticipant[]; allProfiles: ExtractionParticipant[];
};
export type ExtractDependencies = {
  generate?: (input: GenerateStructuredInput<AiExtractionType>) => Promise<GenerateStructuredResult<AiExtractionType>>;
  requestId?: string;
  userId?: string;
};

export function matchOwner(ownerName: string | null, participants: ExtractionParticipant[], allProfiles: ExtractionParticipant[]): string | null {
  if (!ownerName?.trim()) return null;
  const normalized = ownerName.trim().toLocaleLowerCase();
  const exact = allProfiles.filter((profile) => profile.name.trim().toLocaleLowerCase() === normalized);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  const first = normalized.split(/\s+/)[0];
  const amongParticipants = participants.filter((profile) => profile.name.trim().toLocaleLowerCase().split(/\s+/)[0] === first);
  if (amongParticipants.length === 1) return amongParticipants[0].id;
  if (amongParticipants.length > 1) return null;
  const amongAll = allProfiles.filter((profile) => profile.name.trim().toLocaleLowerCase().split(/\s+/)[0] === first);
  return amongAll.length === 1 ? amongAll[0].id : null;
}

export function sanitizeDueDate(dueDate: string | null, meetingDate: string): { dueDate: string | null; reason?: string } {
  if (dueDate === null) return { dueDate: null, reason: "No deadline stated" };
  const parsed = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== dueDate) {
    return { dueDate: null, reason: "Invalid due date" };
  }
  if (dueDate < meetingDate) return { dueDate: null, reason: "Due date is earlier than the meeting date" };
  return { dueDate };
}

export function mapRefs<T extends { ref: string }>(items: T[], allowedRefs: Set<string>): { mapped: T[]; dropped: number } {
  const mapped = items.filter((item) => allowedRefs.has(item.ref));
  return { mapped, dropped: items.length - mapped.length };
}

export async function extractFromNotes(input: ExtractInput, dependencies: ExtractDependencies = {}): Promise<ExtractionResult> {
  const generate = dependencies.generate ?? generateStructured<AiExtractionType>;
  const response = await generate({
    operation: "extract", systemInstruction: SYSTEM_INSTRUCTION,
    userContent: buildUserContent({
      title: input.title, meetingDate: input.meetingDate,
      participants: input.participants.map((profile) => profile.name), notes: input.notes,
    }),
    zodSchema: AiExtraction, jsonSchema: RESPONSE_JSON_SCHEMA,
    requestId: dependencies.requestId ?? "req_ai_extract", userId: dependencies.userId ?? "test-user",
  });
  const action_items = response.data.action_items.map((item) => {
    const owner_id = matchOwner(item.owner_name, input.participants, input.allProfiles);
    const date = sanitizeDueDate(item.due_date, input.meetingDate);
    const review_reasons: string[] = [];
    if (item.owner_name && !owner_id) review_reasons.push(`Owner "${item.owner_name}" not found in team`);
    else if (!item.owner_name) review_reasons.push("Owner not identified");
    if (date.reason) review_reasons.push(date.reason);
    if (item.confidence < 0.7) review_reasons.push("Low confidence");
    return { ...item, owner_id, due_date: date.dueDate, needs_review: review_reasons.length > 0, review_reasons };
  });
  return { ...response.data, action_items, meta: response.meta };
}
