import { Router } from "express";

import { prisma } from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { processJiraWebhook } from "../services/webhookProcessor";

export const webhooksRouter = Router();

webhooksRouter.post(
  "/jira/:secret",
  asyncHandler(async (req, res) => {
    const connection = await prisma.jiraConnection.findUnique({
      where: { webhookSecret: String(req.params.secret) },
    });
    if (!connection) {
      res.status(404).json({ error: "unknown webhook" });
      return;
    }
    await processJiraWebhook(connection, req.body ?? {});
    res.status(202).json({ received: true });
  }),
);
