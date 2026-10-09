export type LogLevel = "info" | "warn" | "error";

/** Receives one already-serialised JSON log line. */
export type LogSink = (line: string) => void;

const defaultSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

let sink: LogSink = defaultSink;

/** Test hook: capture log lines instead of writing to stdout. */
export function setLogSink(next: LogSink): void {
  sink = next;
}

export function resetLogSink(): void {
  sink = defaultSink;
}

/**
 * Converts a thrown value into something JSON-serialisable. `JSON.stringify`
 * of an `Error` yields `{}` because `message`/`stack` are non-enumerable.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack) {
      serialized.stack = error.stack;
    }
    return serialized;
  }
  return { message: String(error) };
}

const ENVELOPE_KEYS = new Set(["ts", "level", "msg"]);

/**
 * Emits one CloudWatch-ingestible JSON line per event: `{ ts, level, msg, … }`.
 * Fields are merged at the top level, but the envelope keys always win.
 */
export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (!ENVELOPE_KEYS.has(key)) {
      entry[key] = value;
    }
  }

  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch (error) {
    line = JSON.stringify({
      ts: entry.ts,
      level,
      msg: message,
      logError: serializeError(error),
    });
  }
  sink(line);
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>): void =>
    log("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>): void =>
    log("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>): void =>
    log("error", message, fields),
};
