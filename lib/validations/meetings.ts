import { z } from "zod";

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Expected a valid calendar date in YYYY-MM-DD format");

export const MeetingIdParams = z.object({ id: z.string().uuid() });
export const MeetingBody = z.object({
  title: z.string().trim().min(1).max(200), meeting_date: IsoDate,
  agenda: z.string().max(5000).optional().nullable(), raw_notes: z.string().max(20000).optional().nullable(),
  participant_ids: z.array(z.string().uuid()).max(100),
});
export const MeetingPatchBody = MeetingBody.partial().extend({ summary: z.string().max(2000).optional().nullable() })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");
export const MeetingListQuery = z.object({
  q: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().datetime({ offset: true }).optional(),
});
export const CommitBody = z.object({
  summary: z.string().trim().min(1).max(2000),
  decisions: z.array(z.object({ text: z.string().trim().min(1), rationale: z.string().nullable().optional() })).max(30),
  risks: z.array(z.object({ text: z.string().trim().min(1), severity: z.enum(["low", "medium", "high"]) })).max(30),
  open_questions: z.array(z.string()).max(30),
  action_items: z.array(z.object({
    title: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable().optional(),
    owner_id: z.string().uuid().nullable(), due_date: IsoDate.nullable(), priority: z.enum(["low", "medium", "high"]),
  })).max(40),
  ai_generated: z.boolean(),
});

export const ExtractBody = z.object({
  meeting_id: z.string().uuid().optional(), meeting_date: IsoDate,
  title: z.string().trim().min(1).max(200), raw_notes: z.string().min(20).max(20000),
  participant_ids: z.array(z.string().uuid()).max(100),
});

export type MeetingInput = z.infer<typeof MeetingBody>;
export type MeetingPatch = z.infer<typeof MeetingPatchBody>;
export type CommitInput = z.infer<typeof CommitBody>;

