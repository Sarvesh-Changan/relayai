import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  GEMINI_MODEL: "gemini-test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("environment validation", () => {
  it("applies documented defaults and permits a missing Gemini key", () => {
    const result = parseEnv(validEnv);
    expect(result.AI_TIMEOUT_MS).toBe(25000);
    expect(result.AI_RATE_LIMIT_PER_MIN).toBe(10);
    expect(result.APP_TIMEZONE).toBe("Asia/Kolkata");
    expect(result.GEMINI_API_KEY).toBeUndefined();
  });

  it("reports missing required variables clearly", () => {
    expect(() => parseEnv({})).toThrow(/Missing required environment variables/);
    expect(() => parseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
