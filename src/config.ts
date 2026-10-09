import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { logger } from "./lib/logger";

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

/** Where an auto-generated JWT secret is persisted (relative to the cwd). */
export const DEFAULT_JWT_SECRET_FILE = path.resolve(process.cwd(), ".data", "jwt.secret");

/**
 * Resolves the JWT signing secret. An explicit `JWT_SECRET` always wins.
 * Otherwise a random secret is generated once and persisted, so tokens issued
 * before a restart stay valid. The previous hardcoded `dev-secret-change-me`
 * fallback is gone — a known constant lets anyone forge tokens.
 */
export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
  secretFile: string = DEFAULT_JWT_SECRET_FILE,
): string {
  const fromEnv = env.JWT_SECRET?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (fs.existsSync(secretFile)) {
    const stored = fs.readFileSync(secretFile, "utf8").trim();
    if (stored) {
      return stored;
    }
  }

  const generated = crypto.randomBytes(48).toString("base64url");
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  logger.warn("config.jwt_secret_generated", { secretFile });
  return generated;
}

export const config = {
  port: Number(optional("PORT", "4000")),
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: optional("JWT_EXPIRES_IN", "30d"),
  publicBaseUrl: optional("PUBLIC_BASE_URL", ""),
};
