import { prisma } from "../db";
import { hub } from "../ws/hub";

export interface TaskSyncInput {
  jiraKey: string;
  title: string;
  status: string;
  prNumber?: number | null;
  prUrl?: string | null;
  branch?: string | null;
  updatedAt: string;
}

export interface TaskSyncResult {
  applied: number;
  tasks: Awaited<ReturnType<typeof prisma.task.findMany>>;
}

/**
 * Applies desktop task snapshots with last-write-wins on `updatedAt`, then
 * returns the server-side tasks (optionally only those changed since `since`).
 * Every applied change is broadcast to the user's other devices; the device
 * that pushed the snapshot is skipped.
 */
export async function syncTasks(
  userId: string,
  incoming: TaskSyncInput[],
  since?: Date,
  originDeviceId?: string,
): Promise<TaskSyncResult> {
  let applied = 0;

  for (const item of incoming) {
    const updatedAt = new Date(item.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      continue;
    }
    const existing = await prisma.task.findUnique({
      where: { userId_jiraKey: { userId, jiraKey: item.jiraKey } },
    });
    if (existing && existing.updatedAt.getTime() > updatedAt.getTime()) {
      continue;
    }
    const data = {
      title: item.title,
      status: item.status,
      prNumber: item.prNumber ?? null,
      prUrl: item.prUrl ?? null,
      branch: item.branch ?? null,
      updatedAt,
    };
    const task = await prisma.task.upsert({
      where: { userId_jiraKey: { userId, jiraKey: item.jiraKey } },
      create: { userId, jiraKey: item.jiraKey, ...data },
      update: data,
    });
    applied += 1;

    hub.broadcast(
      userId,
      "task.updated",
      {
        taskId: task.id,
        jiraKey: task.jiraKey,
        status: task.status,
        prNumber: task.prNumber,
        prUrl: task.prUrl,
        branch: task.branch,
      },
      originDeviceId,
    );

    if (!existing?.prNumber && task.prNumber) {
      hub.broadcast(
        userId,
        "pr.created",
        {
          taskId: task.id,
          jiraKey: task.jiraKey,
          prNumber: task.prNumber,
          prUrl: task.prUrl,
          branch: task.branch,
        },
        originDeviceId,
      );
    }

    if (existing?.status !== "PLAN_READY" && task.status === "PLAN_READY") {
      hub.broadcast(
        userId,
        "plan.ready",
        { taskId: task.id, jiraKey: task.jiraKey, status: task.status },
        originDeviceId,
      );
    }
  }

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      ...(since && !Number.isNaN(since.getTime()) ? { updatedAt: { gt: since } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  return { applied, tasks };
}
