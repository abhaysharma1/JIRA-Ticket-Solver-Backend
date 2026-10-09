import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createRateLimiter } from "../src/middleware/rateLimit";

function failingApp(limiter: ReturnType<typeof createRateLimiter>) {
  const app = express();
  app.post("/login", limiter, (_req, res) => {
    res.status(401).json({ error: "invalid" });
  });
  return app;
}

describe("rate limiter", () => {
  it("blocks after the configured number of failures", async () => {
    const app = failingApp(createRateLimiter({ maxFailures: 3, windowMs: 60_000 }));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app).post("/login");
      expect(response.status).toBe(401);
    }

    const blocked = await request(app).post("/login");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("a successful request clears the bucket", async () => {
    const limiter = createRateLimiter({ maxFailures: 2, windowMs: 60_000 });
    let failing = true;
    const app = express();
    app.post("/login", limiter, (_req, res) => {
      res.status(failing ? 401 : 200).json({});
    });

    await request(app).post("/login");
    failing = false;
    expect((await request(app).post("/login")).status).toBe(200);

    // The success reset the counter, so two more failures are still allowed.
    failing = true;
    expect((await request(app).post("/login")).status).toBe(401);
    expect((await request(app).post("/login")).status).toBe(401);
    expect((await request(app).post("/login")).status).toBe(429);
  });

  it("allows requests again once the window expires", async () => {
    const app = failingApp(createRateLimiter({ maxFailures: 1, windowMs: 40 }));

    expect((await request(app).post("/login")).status).toBe(401);
    expect((await request(app).post("/login")).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await request(app).post("/login")).status).toBe(401);
  });
});
