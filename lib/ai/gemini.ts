import { GoogleGenAI, ThinkingLevel, type Schema } from "@google/genai";
import { z, type ZodType } from "zod";

import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { LOG_EVENTS } from "@/lib/log-events";

type ProviderResult = {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};
type ProviderRequest = {
  model: string; systemInstruction: string; userContent: string; jsonSchema: Schema;
  temperature: number; maxOutputTokens: number; signal: AbortSignal;
};
type GenerateDependencies = { apiKey?: string; model?: string; provider?: (request: ProviderRequest) => Promise<ProviderResult> };

export type GenerateStructuredInput<T> = {
  operation: string;
  systemInstruction: string;
  userContent: string;
  zodSchema: ZodType<T>;
  jsonSchema: Schema;
  timeoutMs?: number;
  requestId: string;
  userId: string;
};
export type GenerateStructuredResult<T> = {
  data: T;
  meta: { model: string; latencyMs: number; attempts: number; tokensIn?: number; tokensOut?: number };
};

const rateWindow = new Map<string, number[]>();

export function resetAiRateLimitForTests(): void {
  rateWindow.clear();
}

function enforceUserRateLimit(userId: string): void {
  const now = Date.now();
  const recent = (rateWindow.get(userId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= env.AI_RATE_LIMIT_PER_MIN) {
    rateWindow.set(userId, recent);
    throw new AppError("RATE_LIMITED", "AI request limit reached. Try again in a minute.");
  }
  recent.push(now);
  rateWindow.set(userId, recent);
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { status?: unknown; code?: unknown; statusCode?: unknown };
  const value = record.status ?? record.statusCode ?? record.code;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function issuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.map(String).join(".") || "$");
}

function parseProviderText<T>(text: string | undefined, schema: ZodType<T>): { data?: T; reason?: string; paths?: string[] } {
  try {
    let raw: unknown = JSON.parse(text ?? "");
    if (Array.isArray(raw) && raw.length === 1) raw = raw[0];
    const parsed = schema.safeParse(raw);
    return parsed.success ? { data: parsed.data } : { reason: "schema", paths: issuePaths(parsed.error) };
  } catch {
    return { reason: "json", paths: ["$"] };
  }
}

export async function generateStructured<T>(
  input: GenerateStructuredInput<T>,
  dependencies: GenerateDependencies = {},
): Promise<GenerateStructuredResult<T>> {
  const started = Date.now();
  const model = dependencies.model ?? env.GEMINI_MODEL;
  const log = childLogger(input.requestId, { operation: input.operation, model });
  let attempts = 0;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  try {
    const apiKey = dependencies.apiKey ?? env.GEMINI_API_KEY;
    if (!apiKey) throw new AppError("AI_NOT_CONFIGURED", "AI extraction is not configured. You can add tasks manually.");
    enforceUserRateLimit(input.userId);
    log.info({ event: LOG_EVENTS.AI_REQUEST_STARTED, operation: input.operation, model }, "AI request started");

    const provider = dependencies.provider ?? (async (request: ProviderRequest) => {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
        model: request.model,
        contents: request.userContent,
        config: {
          systemInstruction: request.systemInstruction,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: "application/json",
          responseJsonSchema: request.jsonSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          abortSignal: request.signal,
        },
      });
      return { text: response.text, usageMetadata: response.usageMetadata };
    });
    const timeoutMs = input.timeoutMs ?? env.AI_TIMEOUT_MS;
    let repairMessage: string | undefined;
    let finalParse: ReturnType<typeof parseProviderText<T>> | undefined;
    let lastResult: ProviderResult | undefined;

    for (let repair = 0; repair < 2; repair += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let result: ProviderResult | undefined;
        for (let transientTry = 0; transientTry < 2; transientTry += 1) {
          attempts += 1;
          try {
            result = await provider({
              model, systemInstruction: input.systemInstruction,
              userContent: repairMessage
                ? `${input.userContent}\n\nThe previous response did not satisfy the required JSON schema (${repairMessage}). Return corrected JSON only.`
                : input.userContent,
              jsonSchema: input.jsonSchema, temperature: 0.2, maxOutputTokens: 2048, signal: controller.signal,
            });
            break;
          } catch (error) {
            if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
              throw new AppError("AI_TIMEOUT", "The AI request timed out. Your notes are still available; you can add tasks manually.", { cause: error });
            }
            const status = statusOf(error);
            if (transientTry === 0 && (status === 429 || (status !== undefined && status >= 500 && status <= 599))) {
              await new Promise((resolve) => setTimeout(resolve, 250 * (transientTry + 1)));
              continue;
            }
            if (status === 429) throw new AppError("AI_RATE_LIMITED", "The AI provider is busy. Please try again shortly.", { cause: error });
            throw new AppError("AI_PROVIDER_ERROR", "The AI provider could not complete this request. You can add tasks manually.", { cause: error });
          }
        }
        if (!result) throw new AppError("AI_PROVIDER_ERROR", "The AI provider returned no response.");
        lastResult = result;
        tokensIn = result.usageMetadata?.promptTokenCount ?? tokensIn;
        tokensOut = result.usageMetadata?.candidatesTokenCount ?? tokensOut;
        finalParse = parseProviderText(result.text, input.zodSchema);
        if (finalParse.data !== undefined) {
          const latencyMs = Date.now() - started;
          log.info({ event: LOG_EVENTS.AI_REQUEST_COMPLETED, operation: input.operation, model, latencyMs, attempts, tokensIn, tokensOut }, "AI request completed");
          return { data: finalParse.data, meta: { model, latencyMs, attempts, ...(tokensIn === undefined ? {} : { tokensIn }), ...(tokensOut === undefined ? {} : { tokensOut }) } };
        }
        log.warn({ event: LOG_EVENTS.AI_VALIDATION_FAILED, operation: input.operation, issuePaths: finalParse.paths ?? [] }, "AI output failed validation");
        repairMessage = (finalParse.paths ?? []).join(", ");
      } finally {
        clearTimeout(timeout);
      }
    }
    void lastResult;
    throw new AppError("AI_INVALID_RESPONSE", "The AI response could not be validated. Your notes are still available; you can add tasks manually.", {
      details: { issuePaths: finalParse?.paths ?? [] },
    });
  } catch (error) {
    const mapped = error instanceof AppError ? error : new AppError("AI_PROVIDER_ERROR", "The AI provider could not complete this request.", { cause: error });
    log.error({ event: LOG_EVENTS.AI_REQUEST_FAILED, operation: input.operation, model, code: mapped.code, latencyMs: Date.now() - started, attempts }, "AI request failed");
    throw mapped;
  }
}
