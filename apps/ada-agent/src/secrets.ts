import fs from "node:fs/promises";
import path from "node:path";
import type { SecretRecord, SecretProvider } from "./types.js";
import { ensureLocalDataDir } from "./config.js";

const SECRET_FILE = "secrets.json";

function resolveProvider(provider: SecretProvider): "file" {
  if (provider === "keychain" || provider === "credman") {
    // TODO: second phase integration with system secret store.
    return "file";
  }
  return "file";
}

export async function saveSecret(
  record: SecretRecord,
  provider: SecretProvider,
  cwd = process.cwd()
): Promise<void> {
  const resolved = resolveProvider(provider);
  if (resolved !== "file") {
    return;
  }

  const dir = await ensureLocalDataDir(cwd);
  const file = path.join(dir, SECRET_FILE);
  await fs.writeFile(file, JSON.stringify(record, null, 2), "utf8");
}

export async function loadSecret(
  provider: SecretProvider,
  cwd = process.cwd()
): Promise<SecretRecord | null> {
  const resolved = resolveProvider(provider);
  if (resolved !== "file") {
    return null;
  }

  try {
    const dir = await ensureLocalDataDir(cwd);
    const file = path.join(dir, SECRET_FILE);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as SecretRecord;
  } catch {
    return null;
  }
}

export async function clearSecret(cwd = process.cwd()): Promise<void> {
  const dir = await ensureLocalDataDir(cwd);
  const file = path.join(dir, SECRET_FILE);
  try {
    await fs.unlink(file);
  } catch {
    // ignore
  }
}
