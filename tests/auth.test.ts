import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { resetDb } from "./helpers";

const app = createApp();

beforeEach(resetDb);

describe("auth", () => {
  it("registers a user and returns a token", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "password123" });
    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe("owner@example.com");
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "password123" });
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "password123" });
    expect(response.status).toBe(409);
  });

  it("rejects a short password", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "short" });
    expect(response.status).toBe(400);
  });

  it("logs in with valid credentials", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "password123" });
    const response = await request(app)
      .post("/auth/login")
      .send({ email: "owner@example.com", password: "password123" });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
  });

  it("rejects an invalid password", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "password123" });
    const response = await request(app)
      .post("/auth/login")
      .send({ email: "owner@example.com", password: "wrong-password" });
    expect(response.status).toBe(401);
  });

  it("returns the current user for a valid token", async () => {
    const registered = await request(app)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "password123" });
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${registered.body.token}`);
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("owner@example.com");
  });

  it("rejects /me without a token", async () => {
    const response = await request(app).get("/auth/me");
    expect(response.status).toBe(401);
  });
});
