import { describe, expect, it, vi } from "vitest";
import { AiExtraction } from "@/lib/ai/schemas";
import { extractFromNotes, mapRefs, matchOwner, sanitizeDueDate } from "@/lib/ai/extract";
import { generateStructured, resetAiRateLimitForTests, type GenerateStructuredInput, type GenerateStructuredResult } from "@/lib/ai/gemini";
import type { AiExtractionType } from "@/lib/ai/schemas";
import { RESPONSE_JSON_SCHEMA } from "@/lib/ai/prompts/extract";

const valid = {
  summary: "The team reviewed the release plan.", decisions: [], action_items: [], risks: [], open_questions: [],
};
const profiles = [
  { id: "a", name: "Rahul Sharma" }, { id: "b", name: "Priya Nair" },
  { id: "c", name: "Priya Patel" }, { id: "d", name: "Dev Patel" },
];

describe("AI extraction validation and post-processing", () => {
  it("U1 parses a valid extraction", () => {
    expect(AiExtraction.parse(valid).summary).toBe(valid.summary);
  });

  it("U2 rejects missing arrays, invalid priority, and malformed dates", () => {
    const result = AiExtraction.safeParse({ ...valid, action_items: [{
      title: "Do work", description: null, owner_name: null, due_date: "tomorrow", priority: "urgent", confidence: 0.5, source_quote: null,
    }] });
    expect(result.success).toBe(false);
    expect(AiExtraction.safeParse({ summary: "Missing arrays" }).success).toBe(false);
  });

  it("U3 matches a unique first name from participants", () => {
    expect(matchOwner("Rahul", [profiles[0]], profiles)).toBe("a");
  });

  it("U4 leaves unknown owners unmatched for review", () => {
    const result = matchOwner("Sam", [profiles[0]], profiles);
    expect(result).toBeNull();
  });

  it("U5 prefers a unique participant first name and rejects ambiguous names", () => {
    expect(matchOwner("Priya", [profiles[1]], profiles)).toBe("b");
    expect(matchOwner("Priya", [], profiles)).toBeNull();
  });

  it("U6 clears a due date before the meeting date", () => {
    expect(sanitizeDueDate("2026-10-29", "2026-10-30")).toEqual({ dueDate: null, reason: "Due date is earlier than the meeting date" });
  });

  it("U7 drops references absent from the allowed context", () => {
    expect(mapRefs([{ ref: "ACT-001" }, { ref: "ACT-999" }], new Set(["ACT-001"]))).toEqual({ mapped: [{ ref: "ACT-001" }], dropped: 1 });
  });

  it("flags missing deadline and confidence and permits injected generator", async () => {
    const generate = vi.fn().mockResolvedValue({
      data: { ...valid, action_items: [{ title: "Finish integration", description: null, owner_name: "Sam", due_date: null, priority: "medium", confidence: 0.5, source_quote: null }] },
      meta: { model: "test", latencyMs: 3, attempts: 1 },
    });
    const result = await extractFromNotes({ title: "Planning", meetingDate: "2026-10-30", notes: "Notes", participants: [profiles[0]], allProfiles: profiles }, {
      generate: generate as unknown as (input: GenerateStructuredInput<AiExtractionType>) => Promise<GenerateStructuredResult<AiExtractionType>>,
    });
    expect(result.action_items[0].owner_id).toBeNull();
    expect(result.action_items[0].needs_review).toBe(true);
    expect(result.action_items[0].review_reasons).toContain("No deadline stated");
    expect(result.action_items[0].review_reasons).toContain("Low confidence");
  });
});

describe("generateStructured retry and configuration behavior", () => {
  const input = {
    operation: "test", systemInstruction: "JSON only", userContent: "notes", zodSchema: AiExtraction,
    jsonSchema: RESPONSE_JSON_SCHEMA, requestId: "req_test", userId: "generate-test-user",
  };

  it("U11 repairs invalid JSON and succeeds on the second attempt", async () => {
    resetAiRateLimitForTests();
    const provider = vi.fn().mockResolvedValueOnce({ text: "not json" }).mockResolvedValueOnce({ text: JSON.stringify(valid) });
    const result = await generateStructured(input, { apiKey: "test-key", model: "test-model", provider });
    expect(result.data.summary).toBe(valid.summary);
    expect(result.meta.attempts).toBe(2);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("U12 reports AI_INVALID_RESPONSE after the single repair attempt", async () => {
    resetAiRateLimitForTests();
    const provider = vi.fn().mockResolvedValue({ text: "not json" });
    await expect(generateStructured({ ...input, userId: "invalid-test-user" }, { apiKey: "test-key", provider })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("U13 reports AI_NOT_CONFIGURED without calling the provider", async () => {
    const provider = vi.fn();
    await expect(generateStructured({ ...input, userId: "missing-key-user" }, { apiKey: "", provider })).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(provider).not.toHaveBeenCalled();
  });
});
