import { describe, expect, it } from "vitest";

import { AppError, mapError } from "@/lib/api/errors";

describe("API error mapping", () => {
  it("maps RPC business errors to documented status codes", () => {
    const error = mapError({ code: "P0001", message: "INVALID_TRANSITION" });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("UNPROCESSABLE");
    expect(error.status).toBe(422);
  });

  it("maps Supabase permission and missing-row errors", () => {
    expect(mapError({ code: "42501", message: "permission denied" }).code).toBe("FORBIDDEN");
    expect(mapError({ code: "PGRST116", message: "No rows returned" }).code).toBe("NOT_FOUND");
  });

  it("does not expose unexpected database details", () => {
    const error = mapError({ code: "XX000", message: "secret database detail" });
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toBe("An unexpected error occurred.");
  });
});
