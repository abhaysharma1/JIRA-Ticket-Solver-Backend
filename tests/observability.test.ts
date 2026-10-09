import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  log,
  logger,
  resetLogSink,
  serializeError,
  setLogSink,
} from "../src/lib/logger";

afterEach(() => {
  resetLogSink();
});

describe("logger", () => {
  it("writes one JSON line with merged fields", () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));

    logger.info("planning.started", { taskId: "task-1", model: "m" });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("planning.started");
    expect(entry.taskId).toBe("task-1");
    expect(entry.model).toBe("m");
    expect(typeof entry.ts).toBe("string");
  });

  it("does not let fields clobber the envelope", () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));

    log("warn", "hello", { level: "fake", msg: "nope" });

    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("warn");
    expect(entry.msg).toBe("hello");
  });

  it("serialises errors with a message and stack", () => {
    const serialized = serializeError(new Error("boom"));
    expect(serialized.name).toBe("Error");
    expect(serialized.message).toBe("boom");
    expect(typeof serialized.stack).toBe("string");
    expect(serializeError("plain")).toEqual({ message: "plain" });
  });

  it("logs an access line for every request", async () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    const app = createApp();

    await request(app).get("/health");

    const access = lines
      .map((line) => JSON.parse(line))
      .find((entry) => entry.msg === "http.request");
    expect(access).toBeDefined();
    expect(access.method).toBe("GET");
    expect(access.path).toBe("/health");
    expect(access.status).toBe(200);
    expect(typeof access.requestId).toBe("string");
    expect(typeof access.durationMs).toBe("number");
  });
});
