import type { NextFunction, Request, Response } from "express";

interface Bucket {
  failures: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxFailures?: number;
}

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_FAILURES = 10;

/**
 * Per-IP failure limiter for credential endpoints. Only failed attempts count
 * and a successful response clears the bucket, so legitimate logins can never
 * lock an honest user out. State is in-memory, so it resets on restart — enough
 * to blunt brute force against a single instance.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  const buckets = new Map<string, Bucket>();

  function bucketFor(key: string, now: number): Bucket {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh: Bucket = { failures: 0, resetAt: now + windowMs };
      buckets.set(key, fresh);
      return fresh;
    }
    return existing;
  }

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const bucket = bucketFor(key, now);

    if (bucket.failures >= maxFailures) {
      const retryAfter = Math.ceil(Math.max(bucket.resetAt - now, 0) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      res.status(429).json({ error: "too many attempts; try again later" });
      return;
    }

    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        buckets.delete(key);
        return;
      }
      // Never count the 429 we produced ourselves.
      if (res.statusCode !== 429) {
        bucketFor(key, Date.now()).failures += 1;
      }
    });

    next();
  };
}
