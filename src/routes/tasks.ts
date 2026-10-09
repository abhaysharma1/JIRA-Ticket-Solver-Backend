import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { httpError } from "../middleware/errorHandler";
import { requireDevice } from "../middleware/deviceAuth";
import { syncTasks } from "../services/taskSync";

export const tasksRouter = Router();

const syncSchema = z.object({
  since: z.string().optional(),
  tasks: z
    .array(
      z.object({
        jiraKey: z.string().min(1),
        title: z.string().default(""),
        status: z.string().default("Unknown"),
        prNumber: z.number().int().nullable().optional(),
        prUrl: z.string().nullable().optional(),
        branch: z.string().nullable().optional(),
        updatedAt: z.string(),
      }),
    )
    .default([]),
});

tasksRouter.get(
  "/",
  requireDevice,
  asyncHandler(async (req, res) => {
    const tasks = await prisma.task.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ tasks });
  }),
);

tasksRouter.post(
  "/sync",
  requireDevice,
  asyncHandler(async (req, res) => {
    const parsed = syncSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw httpError(400, "invalid task sync payload");
    }
    const since = parsed.data.since ? new Date(parsed.data.since) : undefined;
    const result = await syncTasks(
      req.auth!.userId,
      parsed.data.tasks,
      since,
      req.auth!.deviceId,
    );
    res.json(result);
  }),
);

tasksRouter.get(
  "/:jiraKey",
  requireDevice,
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({
      where: {
        userId_jiraKey: { userId: req.auth!.userId, jiraKey: String(req.params.jiraKey) },
      },
    });
    if (!task) {
      throw httpError(404, "task not found");
    }
    res.json({ task });
  }),
);
