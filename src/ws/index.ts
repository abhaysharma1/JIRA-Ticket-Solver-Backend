import type { Server } from "node:http";
import { WebSocketServer } from "ws";

import { resolveDeviceToken } from "../middleware/deviceAuth";
import { hub as defaultHub, NotificationHub } from "./hub";

export const WS_PATH = "/ws";

/**
 * Attaches the desktop event socket to an HTTP server. The handshake is
 * authenticated with the same device token as the REST routes; unauthenticated
 * sockets are closed with code 4401.
 */
export function attachWebSocket(
  server: Server,
  hub: NotificationHub = defaultHub,
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: WS_PATH });

  wss.on("connection", (ws, request) => {
    resolveDeviceToken(request.headers.authorization)
      .then((identity) => {
        if (!identity) {
          ws.close(4401, "invalid device token");
          return;
        }
        const connection = hub.register(identity.userId, identity.deviceId, ws);
        ws.on("pong", () => hub.markAlive(connection));
        ws.on("message", () => hub.markAlive(connection));
        ws.on("close", () => hub.unregister(identity.userId, connection));
        ws.on("error", () => hub.unregister(identity.userId, connection));
        ws.send(
          JSON.stringify({
            event: "connected",
            deviceId: identity.deviceId,
          }),
        );
      })
      .catch(() => ws.close(1011, "authentication failed"));
  });

  hub.startHeartbeat();
  return wss;
}
