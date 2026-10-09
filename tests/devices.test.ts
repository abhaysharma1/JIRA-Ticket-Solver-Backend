import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { registerDevice, registerUser, resetDb } from "./helpers";

const app = createApp();

beforeEach(resetDb);

describe("devices", () => {
  it("registers a device and returns a device token", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    expect(device.deviceToken).toBeTruthy();
    expect(device.deviceId).toMatch(/^device-/);
  });

  it("lists devices without leaking token hashes", async () => {
    const { token } = await registerUser(app);
    await registerDevice(app, token);
    const response = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.devices).toHaveLength(1);
    expect(response.body.devices[0].tokenHash).toBeUndefined();
  });

  it("re-registering the same device id issues a fresh token", async () => {
    const { token } = await registerUser(app);
    const first = await registerDevice(app, token, "shared-device");
    const second = await registerDevice(app, token, "shared-device");
    expect(second.deviceToken).not.toBe(first.deviceToken);
    const response = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${token}`);
    expect(response.body.devices).toHaveLength(1);
  });

  it("rejects a device id owned by another account", async () => {
    const first = await registerUser(app);
    const second = await registerUser(app);
    await registerDevice(app, first.token, "shared-device");
    const response = await request(app)
      .post("/devices")
      .set("Authorization", `Bearer ${second.token}`)
      .send({ deviceId: "shared-device" });
    expect(response.status).toBe(409);
  });

  it("authenticates device-token routes", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);

    const ok = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${device.deviceToken}`);
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .get("/notifications")
      .set("Authorization", "Bearer not-a-real-token");
    expect(bad.status).toBe(401);
  });

  it("deletes a device", async () => {
    const { token } = await registerUser(app);
    const device = await registerDevice(app, token);
    const response = await request(app)
      .delete(`/devices/${device.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(204);
  });
});
