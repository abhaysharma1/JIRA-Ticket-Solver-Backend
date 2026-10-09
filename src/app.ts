import express, { type Express } from "express";

import { authRouter } from "./routes/auth";
import { devicesRouter } from "./routes/devices";
import { healthRouter } from "./routes/health";
import { jiraRouter } from "./routes/jira";
import { notificationsRouter } from "./routes/notifications";
import { tasksRouter } from "./routes/tasks";
import { webhooksRouter } from "./routes/webhooks";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/devices", devicesRouter);
  app.use("/jira", jiraRouter);
  app.use("/webhooks", webhooksRouter);
  app.use("/notifications", notificationsRouter);
  app.use("/tasks", tasksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
