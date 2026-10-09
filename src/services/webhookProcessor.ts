import { Prisma, type JiraConnection } from "@prisma/client";

import { prisma } from "../db";
import { hub } from "../ws/hub";
import { createNotification } from "./notificationRouter";

interface JiraWebhookPayload {
  webhookEvent?: string;
  issue?: {
    id?: string;
    key?: string;
    fields?: {
      summary?: string;
      status?: { name?: string };
    };
  };
  user?: { displayName?: string; name?: string };
}

/**
 * Handles a JIRA webhook: archives the raw event, mirrors the ticket as a Task,
 * and routes a Notification to the owning user's devices.
 */
export async function processJiraWebhook(
  connection: JiraConnection,
  payload: JiraWebhookPayload,
) {
  const eventType = typeof payload.webhookEvent === "string" ? payload.webhookEvent : "unknown";
  const event = await prisma.webhookEvent.create({
    data: {
      connectionId: connection.id,
      eventType,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
  });

  const issue = payload.issue;
  if (issue?.key) {
    const title = issue.fields?.summary ?? issue.key;
    const status = issue.fields?.status?.name ?? "Unknown";
    const existing = await prisma.task.findUnique({
      where: { userId_jiraKey: { userId: connection.userId, jiraKey: issue.key } },
    });
    const task = await prisma.task.upsert({
      where: { userId_jiraKey: { userId: connection.userId, jiraKey: issue.key } },
      create: {
        userId: connection.userId,
        jiraKey: issue.key,
        title,
        status,
        updatedAt: new Date(),
      },
      update: { title, status, updatedAt: new Date() },
    });

    const notification = await createNotification({
      userId: connection.userId,
      type: eventType,
      title: `${issue.key}: ${title}`,
      body: `Status: ${status}`,
      taskId: task.id,
      payload: { jiraKey: issue.key, status, eventType },
    });

    hub.broadcast(
      connection.userId,
      eventType === "jira:issue_created" ? "ticket.created" : "ticket.updated",
      { notification, taskId: task.id, jiraKey: issue.key, status },
    );

    const taskChanged =
      !existing || existing.status !== task.status || existing.title !== task.title;
    if (taskChanged) {
      hub.broadcast(connection.userId, "task.updated", {
        taskId: task.id,
        jiraKey: task.jiraKey,
        status: task.status,
        prNumber: task.prNumber,
        prUrl: task.prUrl,
        branch: task.branch,
      });
    }
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date() },
  });

  return event;
}
