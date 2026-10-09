import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { randomToken, sha256 } from "../lib/crypto";
import { httpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

export const devicesRouter = Router();

const registerSchema = z.object({
  deviceId: z.string().min(1),
  name: z.string().optional(),
  platform: z.string().optional(),
});

function publicDevice(device: {
  id: string;
  deviceId: string;
  name: string | null;
  platform: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: device.id,
    deviceId: device.deviceId,
    name: device.name,
    platform: device.platform,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
  };
}

devicesRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "deviceId is required");
    }
    const userId = req.auth!.userId;
    const { deviceId, name, platform } = parsed.data;

    const existing = await prisma.device.findUnique({ where: { deviceId } });
    if (existing && existing.userId !== userId) {
      throw httpError(409, "device is registered to another account");
    }

    const deviceToken = randomToken();
    const data = {
      userId,
      name: name ?? null,
      platform: platform ?? null,
      tokenHash: sha256(deviceToken),
      lastSeenAt: new Date(),
    };
    const device = existing
      ? await prisma.device.update({ where: { id: existing.id }, data })
      : await prisma.device.create({ data: { deviceId, ...data } });

    res.status(201).json({ ...publicDevice(device), deviceToken });
  }),
);

devicesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const devices = await prisma.device.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ devices: devices.map(publicDevice) });
  }),
);

devicesRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findUnique({ where: { id: String(req.params.id) } });
    if (!device || device.userId !== req.auth!.userId) {
      throw httpError(404, "device not found");
    }
    await prisma.device.delete({ where: { id: device.id } });
    res.status(204).send();
  }),
);
