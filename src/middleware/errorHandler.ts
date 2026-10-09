import { NextFunction, Request, Response } from "express";

import { logger, serializeError } from "../lib/logger";
import type { RequestWithId } from "./requestLogger";

export function httpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = (error as { status?: number }).status ?? 500;
  const requestId = (req as RequestWithId).requestId;
  if (status >= 500) {
    logger.error("request.failed", {
      requestId,
      status,
      method: req.method,
      path: req.originalUrl,
      error: serializeError(error),
    });
  }
  const message =
    error instanceof Error && status < 500 ? error.message : "internal server error";
  res.status(status).json({ error: message });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not found" });
}
