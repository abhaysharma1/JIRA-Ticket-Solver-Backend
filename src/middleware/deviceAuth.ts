import { NextFunction, Request, Response } from "express";

import { prisma } from "../db";
import { sha256 } from "../lib/crypto";

export interface DeviceIdentity {
  id: string;
  userId: string;
  deviceId: string;
}

/**
 * Resolves an `Authorization` header value to a device, or `null` when the
 * header is missing or the token is unknown. Shared by the HTTP middleware and
 * the WebSocket handshake so both authenticate identically.
 */
export async function resolveDeviceToken(
  header: string | undefined,
): Promise<DeviceIdentity | null> {
  const value = header ?? "";
  if (!value.startsWith("Bearer ")) {
    return null;
  }
  const tokenHash = sha256(value.slice(7));
  const device = await prisma.device.findUnique({ where: { tokenHash } });
  if (!device) {
    return null;
  }
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });
  return { id: device.id, userId: device.userId, deviceId: device.deviceId };
}

export function requireDevice(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  resolveDeviceToken(header)
    .then((identity) => {
      if (!identity) {
        res.status(401).json({ error: "invalid device token" });
        return;
      }
      req.auth = { userId: identity.userId, deviceId: identity.deviceId };
      next();
    })
    .catch(next);
}
