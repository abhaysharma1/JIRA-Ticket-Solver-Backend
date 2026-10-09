import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { config } from "../config";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub?: string };
    if (!payload.sub) {
      throw new Error("token has no subject");
    }
    req.auth = { userId: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}
