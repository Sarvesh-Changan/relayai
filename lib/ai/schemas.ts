import { z } from "zod";

export const AiExtraction = z.object({
  summary: z.string().max(800),
  decisions: z.array(z.object({ text: z.string(), rationale: z.string().nullable() })),
  action_items: z.array(z.object({
    title: z.string(), description: z.string().nullable(), owner_name: z.string().nullable(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    priority: z.enum(["low", "medium", "high"]), confidence: z.number().min(0).max(1),
    source_quote: z.string().max(200).nullable(),
  })),
  risks: z.array(z.object({ text: z.string(), severity: z.enum(["low", "medium", "high"]) })),
  open_questions: z.array(z.string()),
});

export const AiLinkSuggestions = z.object({ suggestions: z.array(z.object({
  ref: z.string(), relevance: z.number().min(0).max(1), reason: z.string().max(240),
})) });

export const AiInsights = z.object({ headline: z.string(), insights: z.array(z.object({
  severity: z.enum(["high", "medium", "low"]), title: z.string(), explanation: z.string(),
  task_refs: z.array(z.string()), recommendation: z.string(),
})).max(5) });

export const AiHandover = z.object({
  headline: z.string(), situation: z.string().max(600),
  decisions: z.array(z.object({ text: z.string(), meeting_ref: z.string().nullable() })),
  in_progress: z.array(z.object({ task_ref: z.string(), state_summary: z.string() })),
  remaining: z.array(z.object({ task_ref: z.string(), what_is_left: z.string() })),
  blockers: z.array(z.object({ text: z.string(), task_ref: z.string().nullable() })),
  deadlines: z.array(z.object({ task_ref: z.string(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string() })),
  risks: z.array(z.string()),
  next_steps: z.array(z.object({ order: z.number().int(), action: z.string(), task_ref: z.string().nullable(), reason: z.string() })),
  references: z.array(z.object({ type: z.enum(["meeting", "document", "task"]), ref: z.string(), title: z.string(), why: z.string() })),
  gaps: z.array(z.string()),
});

export type AiExtractionType = z.infer<typeof AiExtraction>;

