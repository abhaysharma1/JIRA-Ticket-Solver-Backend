import { Router } from "express";
import { z } from "zod";

import { config } from "../config";
import { prisma } from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { randomToken } from "../lib/crypto";
import { httpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

export const jiraRouter = Router();

const connectionSchema = z.object({
  siteUrl: z.string().url(),
  // Optional and unvalidated: OAuth connections may not expose an email.
  email: z.string().optional(),
});

export function webhookUrl(secret: string): string {
  const base = config.publicBaseUrl || `http://localhost:${config.port}`;
  return `${base}/webhooks/jira/${secret}`;
}

function publicConnection(connection: {
  id: string;
  siteUrl: string;
  email: string;
  webhookSecret: string;
  createdAt: Date;
}) {
  return {
    id: connection.id,
    siteUrl: connection.siteUrl,
    email: connection.email,
    webhookUrl: webhookUrl(connection.webhookSecret),
    createdAt: connection.createdAt,
  };
}

jiraRouter.post(
  "/connections",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = connectionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "siteUrl (URL) and email are required");
    }
    const connection = await prisma.jiraConnection.create({
      data: {
        userId: req.auth!.userId,
        siteUrl: parsed.data.siteUrl,
        email: parsed.data.email?.toLowerCase() ?? "",
        webhookSecret: randomToken(24),
      },
    });
    res.status(201).json({ connection: publicConnection(connection) });
  }),
);

jiraRouter.get(
  "/connections",
  requireAuth,
  asyncHandler(async (req, res) => {
    const connections = await prisma.jiraConnection.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ connections: connections.map(publicConnection) });
  }),
);

jiraRouter.delete(
  "/connections/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const connection = await prisma.jiraConnection.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!connection || connection.userId !== req.auth!.userId) {
      throw httpError(404, "connection not found");
    }
    await prisma.jiraConnection.delete({ where: { id: connection.id } });
    res.status(204).send();
  }),
);
