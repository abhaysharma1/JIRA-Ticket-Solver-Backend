import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { registerDevice, registerUser, resetDb } from "./helpers";

const app = createApp();

beforeEach(resetDb);

function task(overrides: Record<string, unknown> = {}) {
  return {
    jiraKey: "CC-142",
    title: "Add pagination to API",
    status: "In Development",
    prNumber: 42,
    prUrl: "https://github.com/acme/repo/pull/42",
    branch: "cc-142-pagination",
    updatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("task sync", () => {
  it("applies pushed tasks and returns them", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    const response = await request(app)
      .post("/tasks/sync")
      .set("Authorization", `Bearer ${device.deviceToken}`)
      .send({ tasks: [task(), task({ jiraKey: "CC-143", title: "Another" })] });
    expect(response.status).toBe(200);
    expect(response.body.applied).toBe(2);
    expect(response.body.tasks).toHaveLength(2);
  });

  it("keeps the newest snapshot (last write wins)", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    const auth = { Authorization: `Bearer ${device.deviceToken}` };

    await request(app)
      .post("/tasks/sync")
      .set(auth)
      .send({ tasks: [task({ status: "In Development" })] });

    const older = await request(app)
      .post("/tasks/sync")
      .set(auth)
      .send({
        tasks: [
          task({
            status: "To Do",
            updatedAt: new Date("2025-12-31T10:00:00.000Z").toISOString(),
          }),
        ],
      });
    expect(older.body.applied).toBe(0);

    const newer = await request(app)
      .post("/tasks/sync")
      .set(auth)
      .send({
        tasks: [
          task({
            status: "In Review",
            updatedAt: new Date("2026-01-02T10:00:00.000Z").toISOString(),
          }),
        ],
      });
    expect(newer.body.applied).toBe(1);

    const single = await request(app).get("/tasks/CC-142").set(auth);
    expect(single.body.task.status).toBe("In Review");
  });

  it("filters by since cursor", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    const auth = { Authorization: `Bearer ${device.deviceToken}` };

    await request(app)
      .post("/tasks/sync")
      .set(auth)
      .send({
        tasks: [
          task({ updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString() }),
          task({ jiraKey: "CC-144", updatedAt: new Date("2026-03-01T00:00:00.000Z").toISOString() }),
        ],
      });

    const response = await request(app)
      .post("/tasks/sync")
      .set(auth)
      .send({ since: new Date("2026-02-01T00:00:00.000Z").toISOString(), tasks: [] });
    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.tasks[0].jiraKey).toBe("CC-144");
  });
});
