import { Router } from "express";

import { prisma } from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { httpError } from "../middleware/errorHandler";
import { requireDevice } from "../middleware/deviceAuth";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  requireDevice,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const after = typeof req.query.after === "string" ? new Date(req.query.after) : null;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.auth!.userId,
        ...(after && !Number.isNaN(after.getTime()) ? { createdAt: { gt: after } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ notifications });
  }),
);

notificationsRouter.post(
  "/:id/read",
  requireDevice,
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!notification || notification.userId !== req.auth!.userId) {
      throw httpError(404, "notification not found");
    }
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
    res.json({ notification: updated });
  }),
);
