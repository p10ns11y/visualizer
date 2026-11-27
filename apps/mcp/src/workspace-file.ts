import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createSampleWorkspace,
  readPersistedWorkspace,
  serializeWorkspace,
  type WorkspaceState,
} from "@visualizer/core";

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
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, serializeWorkspace(state), "utf8");
  await rename(temporary, path);
}

export async function withFileLock<T>(path: string, body: () => Promise<T>): Promise<T> {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        return await body();
      } finally {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "EEXIST") throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 30_000) await unlink(lockPath);
      } catch {
        // Another process removed the lock.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Workspace file lock timed out for ${path}.`);
}
