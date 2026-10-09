import { Prisma } from "@prisma/client";

import { prisma } from "../db";

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  taskId?: string;
  payload?: Record<string, unknown>;
}

export async function createNotification(input: NotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      taskId: input.taskId ?? null,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
