import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

import { logger } from "../lib/logger";

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Structured access log: one JSON line per request carrying a request id and
 * duration, so a slow or failing route can be traced in CloudWatch.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  (req as RequestWithId).requestId = requestId;
  const started = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    logger.info("http.request", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  next();
}
