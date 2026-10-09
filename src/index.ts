import { config } from "./config";
import { createApp } from "./app";
import { prisma } from "./db";
import { logger, serializeError } from "./lib/logger";
import { attachWebSocket } from "./ws";

async function main(): Promise<void> {
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info("server.listening", { port: config.port });
  });
  const wss = attachWebSocket(server);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("server.shutdown", { signal });
    wss.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("server.start_failed", { error: serializeError(error) });
  process.exit(1);
});
