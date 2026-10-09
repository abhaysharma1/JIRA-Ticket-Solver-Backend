import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createConnection, registerDevice, registerUser, resetDb } from "./helpers";

const app = createApp();

beforeEach(resetDb);

async function seedNotification(
  token: string,
  key: string,
  eventType = "jira:issue_created",
): Promise<void> {
  const connection = await createConnection(app, token);
  await request(app)
    .post(`/webhooks/jira/${connection.webhookSecret}`)
    .send({
      webhookEvent: eventType,
      issue: {
        id: "10001",
        key,
        fields: { summary: `${key} title`, status: { name: "To Do" } },
      },
    });
}

function auth(deviceToken: string) {
  return { Authorization: `Bearer ${deviceToken}` };
}

describe("notifications", () => {
  it("marks a notification as read", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    await seedNotification(token, "CC-1");

    const list = await request(app)
      .get("/notifications")
      .set(auth(device.deviceToken));
    const id = list.body.notifications[0].id;
    expect(list.body.notifications[0].readAt).toBeNull();

    const read = await request(app)
      .post(`/notifications/${id}/read`)
      .set(auth(device.deviceToken));
    expect(read.status).toBe(200);
    expect(read.body.notification.readAt).toBeTruthy();
  });

  it("filters notifications with the after cursor", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    await seedNotification(token, "CC-1");

    const past = new Date(Date.now() - 60_000).toISOString();
    const recent = await request(app)
      .get(`/notifications?after=${encodeURIComponent(past)}`)
      .set(auth(device.deviceToken));
    expect(recent.body.notifications).toHaveLength(1);

    const future = new Date(Date.now() + 60_000).toISOString();
    const empty = await request(app)
      .get(`/notifications?after=${encodeURIComponent(future)}`)
      .set(auth(device.deviceToken));
    expect(empty.body.notifications).toHaveLength(0);
  });

  it("does not let one user read another user's notification", async () => {
    const first = await registerUser(app);
    const firstDevice = await registerDevice(app, first.token);
    await seedNotification(first.token, "CC-1");

    const list = await request(app)
      .get("/notifications")
      .set(auth(firstDevice.deviceToken));
    const id = list.body.notifications[0].id;

    const second = await registerUser(app);
    const secondDevice = await registerDevice(app, second.token);
    const response = await request(app)
      .post(`/notifications/${id}/read`)
      .set(auth(secondDevice.deviceToken));
    expect(response.status).toBe(404);
  });
});
