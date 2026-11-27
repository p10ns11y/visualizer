import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { realpathSync, existsSync } from "node:fs";
import {
  createSampleWorkspace,
  mergeAuxIntoTick,
  readPersistedWorkspace,
  serializeWorkspace,
  type WorkspaceState,
} from "@visualizer/core";

const fileMode = 0o600;
const dirMode = 0o700;

type LockOwner = {
  pid: number;
  starttime: string | null;
};

export async function ensurePrivateDir(path: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: dirMode });
  await chmod(dir, dirMode);
}

export async function loadWorkspace(path: string): Promise<WorkspaceState> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = readPersistedWorkspace(text);
    if (!parsed) throw new Error(`Workspace file ${path} did not parse.`);
    return parsed;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") return createSampleWorkspace();
    throw error;
  }
}

export async function saveWorkspace(path: string, state: WorkspaceState): Promise<void> {
  await ensurePrivateDir(path);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, serializeWorkspace(state), { encoding: "utf8", mode: fileMode });
  await chmod(temporary, fileMode);
  await rename(temporary, path);
  await chmod(path, fileMode);
}

function statStart(text: string): string | null {
  const end = text.lastIndexOf(")");
  if (end < 0) return null;
  const fields = text.slice(end + 2).trim().split(/\s+/);
  return fields[19] ?? null;
}

async function processStart(pid: number): Promise<string | null> {
  try {
    return statStart(await readFile(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return null;
  }
}

async function readLockOwner(lockPath: string): Promise<LockOwner | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(lockPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { pid?: unknown; starttime?: unknown };
    if (typeof record.pid !== "number" || !Number.isInteger(record.pid) || record.pid <= 0) return null;
    return {
      pid: record.pid,
      starttime: typeof record.starttime === "string" ? record.starttime : null,
    };
  } catch {
    return null;
  }
}

async function ownerIsDead(owner: LockOwner): Promise<boolean> {
  const start = await processStart(owner.pid);
  if (start === null) return true;
  if (owner.starttime === null) return false;
  return start !== owner.starttime;
}

export async function withFileLock<T>(path: string, body: () => Promise<T>): Promise<T> {
  const lockPath = `${path}.lock`;
  await ensurePrivateDir(path);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const starttime = await processStart(process.pid);
      await writeFile(lockPath, JSON.stringify({ pid: process.pid, starttime }), {
        flag: "wx",
        mode: fileMode,
      });
      await chmod(lockPath, fileMode);
      try {
        return await body();
      } finally {
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "EEXIST") throw error;
      const owner = await readLockOwner(lockPath);
      if (owner && (await ownerIsDead(owner))) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  }
  throw new Error(`Workspace file lock timed out for ${path}.`);
}

export async function landWorkspaceTick(
  path: string,
  tick: WorkspaceState,
  startedVersion: number,
): Promise<WorkspaceState> {
  return withFileLock(path, async () => {
    const seen = await loadWorkspace(path);
    if (seen.stateVersion > startedVersion) return seen;
    const merged = mergeAuxIntoTick(seen, tick);
    await saveWorkspace(path, merged);
    return merged;
  });
}

function rooted(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

export function statePathInsideRoot(root: string, requested: string): boolean {
  const base = rooted(root);
  const parent = dirname(requested);
  const resolvedParent = rooted(parent);
  const target = resolve(resolvedParent, basename(requested));
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
