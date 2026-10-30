import { Writable } from "node:stream";

import pino from "pino";
import { describe, expect, it } from "vitest";

import { loggerOptions } from "@/lib/logger";

describe("logger redaction", () => {
  it("redacts sensitive fields from JSON output", () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const testLogger = pino(loggerOptions, stream);

    testLogger.info({ authorization: "Bearer secret", cookie: "session=secret", apiKey: "secret", raw_notes: "private", content: "private", password: "private" }, "test");

    const output = chunks.join("");
    expect(output).not.toContain("Bearer secret");
    expect(output).not.toContain("session=secret");
    expect(output).not.toContain("private");
    expect(output).toContain("[Redacted]");
  });
});
