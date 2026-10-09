import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { WebSocket, type RawData } from "ws";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { attachWebSocket } from "../src/ws";
import { hub } from "../src/ws/hub";
import { createConnection, registerDevice, registerUser, resetDb } from "./helpers";

const app = createApp();

let server: Server;
let port: number;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  server = createServer(app);
  attachWebSocket(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  hub.reset();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  hub.reset();
  await resetDb();
});

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
});

function openSocket(deviceToken: string): WebSocket {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  sockets.push(socket);
  return socket;
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", (code) => resolve(code)));
}

interface WsMessage {
  event: string;
  [key: string]: unknown;
}

function waitForEvent(socket: WebSocket, event: string, timeoutMs = 4000): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    function handler(data: RawData): void {
      const message = JSON.parse(data.toString()) as WsMessage;
      if (message.event === event) {
        clearTimeout(timer);
        socket.off("message", handler);
        resolve(message);
      }
    }
    const timer = setTimeout(() => {
      socket.off("message", handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    socket.on("message", handler);
  });
}

function recordEvents(socket: WebSocket): string[] {
  const events: string[] = [];
  socket.on("message", (data: RawData) => {
    events.push((JSON.parse(data.toString()) as WsMessage).event);
  });
  return events;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function issueWebhook(key: string, summary: string, status: string) {
  return {
    webhookEvent: "jira:issue_created",
    issue: {
      id: "10001",
      key,
      fields: { summary, status: { name: status } },
    },
  };
}

describe("websocket hub", () => {
  it("rejects an invalid device token", async () => {
    const socket = openSocket("not-a-real-token");
    const code = await waitForClose(socket);
    expect(code).toBe(4401);
    expect(hub.size()).toBe(0);
  });

  it("pushes ticket and task events to connected devices", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    const socket = openSocket(device.deviceToken);
    const connected = waitForEvent(socket, "connected");
    await waitForOpen(socket);
    await connected;

    const connection = await createConnection(app, token);
    const ticketEvent = waitForEvent(socket, "ticket.created");
    const taskEvent = waitForEvent(socket, "task.updated");
    await request(app)
      .post(`/webhooks/jira/${connection.webhookSecret}`)
      .send(issueWebhook("CC-142", "Add pagination", "To Do"));

    const ticket = await ticketEvent;
    expect(ticket.jiraKey).toBe("CC-142");
    const notification = ticket.notification as {
      title: string;
      payload: { eventType: string };
    };
    expect(notification.title).toBe("CC-142: Add pagination");
    expect(notification.payload.eventType).toBe("jira:issue_created");

    const task = await taskEvent;
    expect(task.status).toBe("To Do");
  });

  it("does not deliver one user's events to another user", async () => {
    const first = await registerUser(app);
    const firstDevice = await registerDevice(app, first.token);
    const second = await registerUser(app);
    const secondDevice = await registerDevice(app, second.token);

    const wsFirst = openSocket(firstDevice.deviceToken);
    const wsSecond = openSocket(secondDevice.deviceToken);
    await Promise.all([waitForOpen(wsFirst), waitForOpen(wsSecond)]);
    const secondEvents = recordEvents(wsSecond);

    const connection = await createConnection(app, first.token);
    const delivered = waitForEvent(wsFirst, "ticket.created");
    await request(app)
      .post(`/webhooks/jira/${connection.webhookSecret}`)
      .send(issueWebhook("CC-1", "One", "To Do"));
    await delivered;

    await sleep(200);
    expect(secondEvents.filter((event) => event !== "connected")).toHaveLength(0);
  });

  it("relays task sync changes to other devices only", async () => {
    const { token } = await registerUser(app);
    const primary = await registerDevice(app, token);
    const secondary = await registerDevice(app, token);

    const wsPrimary = openSocket(primary.deviceToken);
    const wsSecondary = openSocket(secondary.deviceToken);
    await Promise.all([waitForOpen(wsPrimary), waitForOpen(wsSecondary)]);
    const primaryEvents = recordEvents(wsPrimary);

    const planReady = waitForEvent(wsSecondary, "plan.ready");
    const prCreated = waitForEvent(wsSecondary, "pr.created");
    const taskUpdated = waitForEvent(wsSecondary, "task.updated");

    const response = await request(app)
      .post("/tasks/sync")
      .set("Authorization", `Bearer ${primary.deviceToken}`)
      .send({
        tasks: [
          {
            jiraKey: "CC-9",
            title: "Ship it",
            status: "PLAN_READY",
            prNumber: 12,
            prUrl: "https://github.com/acme/repo/pull/12",
            branch: "cc-9-ship-it",
            updatedAt: new Date().toISOString(),
          },
        ],
      });
    expect(response.status).toBe(200);

    const [plan, pr, task] = await Promise.all([planReady, prCreated, taskUpdated]);
    expect(plan.jiraKey).toBe("CC-9");
    expect(pr.prNumber).toBe(12);
    expect(task.status).toBe("PLAN_READY");

    await sleep(200);
    expect(primaryEvents.filter((event) => event !== "connected")).toHaveLength(0);
  });
});
