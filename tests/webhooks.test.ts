import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createConnection, registerDevice, registerUser, resetDb } from "./helpers";

const app = createApp();

beforeEach(resetDb);

function issueWebhook(key: string, summary: string, status: string) {
  return {
    webhookEvent: "jira:issue_updated",
    issue: {
      id: "10001",
      key,
      fields: { summary, status: { name: status } },
    },
  };
}

describe("jira connections", () => {
  it("creates a connection with a webhook url", async () => {
    const { token } = await registerUser(app);
    const connection = await createConnection(app, token);
    expect(connection.id).toBeTruthy();
    expect(connection.webhookUrl).toContain(`/webhooks/jira/${connection.webhookSecret}`);
  });

  it("accepts a connection without an email", async () => {
    const { token } = await registerUser(app);
    const response = await request(app)
      .post("/jira/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteUrl: "https://acme.atlassian.net", email: "" });
    expect(response.status).toBe(201);
    expect(response.body.connection.webhookUrl).toContain("/webhooks/jira/");
  });

  it("lists and deletes connections", async () => {
    const { token } = await registerUser(app);
    const connection = await createConnection(app, token);
    const list = await request(app)
      .get("/jira/connections")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.connections).toHaveLength(1);

    const removed = await request(app)
      .delete(`/jira/connections/${connection.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(removed.status).toBe(204);
  });
});

describe("jira webhooks", () => {
  it("mirrors a ticket and routes a notification when a webhook arrives", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    const connection = await createConnection(app, token);

    const received = await request(app)
      .post(`/webhooks/jira/${connection.webhookSecret}`)
      .send(issueWebhook("CC-142", "Add pagination to API", "To Do"));
    expect(received.status).toBe(202);

    const tasks = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${device.deviceToken}`);
    expect(tasks.body.tasks).toHaveLength(1);
    expect(tasks.body.tasks[0].jiraKey).toBe("CC-142");
    expect(tasks.body.tasks[0].status).toBe("To Do");

    const notifications = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${device.deviceToken}`);
    expect(notifications.body.notifications).toHaveLength(1);
    expect(notifications.body.notifications[0].title).toContain("CC-142");
  });

  it("updates the mirrored task and notifies again on status change", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    const connection = await createConnection(app, token);

    await request(app)
      .post(`/webhooks/jira/${connection.webhookSecret}`)
      .send(issueWebhook("CC-142", "Add pagination to API", "To Do"));
    await request(app)
      .post(`/webhooks/jira/${connection.webhookSecret}`)
      .send(issueWebhook("CC-142", "Add pagination to API", "In Progress"));

    const tasks = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${device.deviceToken}`);
    expect(tasks.body.tasks).toHaveLength(1);
    expect(tasks.body.tasks[0].status).toBe("In Progress");

    const notifications = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${device.deviceToken}`);
    expect(notifications.body.notifications).toHaveLength(2);
  });

  it("rejects an unknown webhook secret", async () => {
    const response = await request(app)
      .post("/webhooks/jira/not-a-real-secret")
      .send(issueWebhook("CC-1", "Nope", "To Do"));
    expect(response.status).toBe(404);
  });
});
