import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const booleanFromEnv = z.preprocess(
  (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return value;
    return value.toLowerCase() === "true" ? true : value.toLowerCase() === "false" ? false : value;
  },
  z.boolean(),
);

export const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  AI_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  APP_TIMEZONE: z.string().min(1).default("Asia/Kolkata"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_TO_FILE: booleanFromEnv.default(true),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_DEMO_HINTS: booleanFromEnv.optional().default(false),
  SEED_PASSWORD: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(input: Record<string, string | undefined> = process.env): Env {
  const normalized = { ...input };
  const optionalNames = [
    "GEMINI_API_KEY",
    "AI_TIMEOUT_MS",
    "AI_RATE_LIMIT_PER_MIN",
    "APP_TIMEZONE",
    "LOG_LEVEL",
    "LOG_TO_FILE",
    "NEXT_PUBLIC_DEMO_HINTS",
    "SEED_PASSWORD",
  ];
  optionalNames.forEach((name) => {
    if (normalized[name]?.trim() === "") normalized[name] = undefined;
  });
  const normalizedInput = {
    ...normalized,
    LOG_TO_FILE: normalized.LOG_TO_FILE ?? (input.NODE_ENV === "production" ? "false" : "true"),
  };
  const result = EnvSchema.safeParse(normalizedInput);
  if (result.success) return result.data;

  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_MODEL",
    "NEXT_PUBLIC_APP_URL",
  ];
  const missing = required.filter((name) => !input[name]).map((name) => name);
  const invalid = result.error.issues
    .filter((issue) => !missing.includes(issue.path.join(".")))
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const sections = [
    missing.length > 0 ? `Missing required environment variables: ${missing.join(", ")}` : "",
    invalid.length > 0 ? `Invalid environment variables: ${invalid.join("; ")}` : "",
  ].filter(Boolean);
  throw new Error(sections.join(" "));
}

export const env = parseEnv();
