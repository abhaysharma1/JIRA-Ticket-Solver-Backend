import { WebSocket } from "ws";

interface Connection {
  ws: WebSocket;
  deviceId: string;
  alive: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Tracks live desktop connections per user and fans events out to every device
 * that did not originate them. In-memory only: a single backend process owns
 * the sockets, which matches the current single-instance deployment.
 */
export class NotificationHub {
  private connections = new Map<string, Set<Connection>>();
  private heartbeat: NodeJS.Timeout | null = null;

  register(userId: string, deviceId: string, ws: WebSocket): Connection {
    const connection: Connection = { ws, deviceId, alive: true };
    const existing = this.connections.get(userId) ?? new Set<Connection>();
    existing.add(connection);
    this.connections.set(userId, existing);
    return connection;
  }

  markAlive(connection: Connection): void {
    connection.alive = true;
  }

  unregister(userId: string, connection: Connection): void {
    const set = this.connections.get(userId);
    if (!set) {
      return;
    }
    set.delete(connection);
    if (set.size === 0) {
      this.connections.delete(userId);
    }
  }

  /**
   * Sends `{ event, ...payload }` to every live connection for the user, except
   * the originating device when one is given. Returns how many were delivered.
   */
  broadcast(
    userId: string,
    event: string,
    payload: Record<string, unknown> = {},
    exceptDeviceId?: string,
  ): number {
    const set = this.connections.get(userId);
    if (!set) {
      return 0;
    }
    const message = JSON.stringify({ event, ...payload });
    let delivered = 0;
    for (const connection of [...set]) {
      if (exceptDeviceId && connection.deviceId === exceptDeviceId) {
        continue;
      }
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(message);
        delivered += 1;
      } else {
        this.unregister(userId, connection);
      }
    }
    return delivered;
  }

  size(): number {
    let total = 0;
    for (const set of this.connections.values()) {
      total += set.size;
    }
    return total;
  }

  /** Pings every connection, terminating any that missed the previous ping. */
  startHeartbeat(intervalMs = HEARTBEAT_INTERVAL_MS): void {
    if (this.heartbeat) {
      return;
    }
    this.heartbeat = setInterval(() => {
      for (const [userId, set] of this.connections) {
        for (const connection of [...set]) {
          if (!connection.alive) {
            connection.ws.terminate();
            this.unregister(userId, connection);
            continue;
          }
          connection.alive = false;
          try {
            connection.ws.ping();
          } catch {
            this.unregister(userId, connection);
          }
        }
      }
    }, intervalMs);
    this.heartbeat.unref?.();
  }

  stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  /** Drops all connections and timers (used between tests). */
  reset(): void {
    this.stopHeartbeat();
    this.connections.clear();
  }
}

/** Process-wide hub used by the HTTP routes and the WebSocket server. */
export const hub = new NotificationHub();
