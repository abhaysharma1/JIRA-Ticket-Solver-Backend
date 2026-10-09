import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveJwtSecret } from "../src/config";

function tempSecretFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jwt-secret-"));
  return path.join(dir, "nested", "jwt.secret");
}

describe("jwt secret resolution", () => {
  it("prefers an explicit JWT_SECRET", () => {
    const file = tempSecretFile();
    const secret = resolveJwtSecret({ JWT_SECRET: "explicit-secret" }, file);
    expect(secret).toBe("explicit-secret");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("generates and persists a random secret when unset", () => {
    const file = tempSecretFile();
    const first = resolveJwtSecret({}, file);
    expect(first).not.toBe("dev-secret-change-me");
    expect(first.length).toBeGreaterThan(30);
    expect(fs.existsSync(file)).toBe(true);

    // A second call (e.g. after a restart) reads the persisted value.
    const second = resolveJwtSecret({}, file);
    expect(second).toBe(first);
  });

  it("reuses an existing persisted secret", () => {
    const file = tempSecretFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "persisted-secret");
    expect(resolveJwtSecret({}, file)).toBe("persisted-secret");
  });
});
