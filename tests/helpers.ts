import type { Express } from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { prisma } from "../src/db";

export async function resetDb(): Promise<void> {
  await prisma.webhookEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.jiraConnection.deleteMany();
  await prisma.device.deleteMany();
  await prisma.user.deleteMany();
}

export async function registerUser(
  app: Express,
  email = `user-${randomUUID()}@example.com`,
  password = "password123",
): Promise<{ token: string; user: { id: string; email: string } }> {
  const response = await request(app).post("/auth/register").send({ email, password });
  return response.body;
}

export async function registerDevice(
  app: Express,
  token: string,
  deviceId = `device-${randomUUID()}`,
): Promise<{ id: string; deviceId: string; deviceToken: string }> {
  const response = await request(app)
    .post("/devices")
    .set("Authorization", `Bearer ${token}`)
    .send({ deviceId, name: "test device", platform: "win32" });
  return response.body;
}

export async function createConnection(
  app: Express,
  token: string,
  siteUrl = "https://example.atlassian.net",
): Promise<{ id: string; webhookUrl: string; webhookSecret: string }> {
  const response = await request(app)
    .post("/jira/connections")
    .set("Authorization", `Bearer ${token}`)
    .send({ siteUrl, email: "owner@example.com" });
  const connection = response.body.connection;
  return {
    id: connection.id,
    webhookUrl: connection.webhookUrl,
    webhookSecret: connection.webhookUrl.split("/").pop(),
  };
}
