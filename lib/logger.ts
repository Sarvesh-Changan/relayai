import pino, { type Logger } from "pino";

import { env } from "@/lib/env";

export const loggerOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: [
    "authorization",
    "cookie",
    "apiKey",
    "raw_notes",
    "content",
    "password",
    "*.authorization",
    "*.cookie",
    "*.apiKey",
    "*.raw_notes",
    "*.content",
    "*.password",
  ],
};

export function createLogger(streams: pino.StreamEntry[] = [{ stream: process.stdout }]): Logger {
  return pino(loggerOptions, pino.multistream(streams));
}

const streams: pino.StreamEntry[] = [{ stream: process.stdout }];
if (env.LOG_TO_FILE) streams.push({ stream: pino.destination({ dest: "logs/app.log", mkdir: true, sync: false }) });

export const logger = createLogger(streams);

export function childLogger(requestId: string, bindings: Record<string, unknown> = {}): Logger {
  return logger.child({ requestId, ...bindings });
}
