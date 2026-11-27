import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrainRouter, createSampleWorkspace, runGuidedBuild, type EnsemblyRecord } from "@visualizer/core";
import { afterEach, describe, expect, it } from "vitest";
import { landWorkspaceTick, loadWorkspace, saveWorkspace, withFileLock } from "./workspace-file.js";

const mcpRoot = fileURLToPath(new URL("..", import.meta.url));

describe("workspace file", () => {
  let directory = "";

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = "";
  });

  it("writes the workspace as 0600 inside a 0700 directory and keeps the lock private", async () => {
    directory = await mkdtemp(join(tmpdir(), "visualizer-mode-"));
    const path = join(directory, "nested", "workspace.json");
    await saveWorkspace(path, createSampleWorkspace());
    const file = await stat(path);
    const dir = await stat(join(directory, "nested"));
    expect(file.mode & 0o777).toBe(0o600);
    expect(dir.mode & 0o777).toBe(0o700);
    await withFileLock(path, async () => {
      const lock = await stat(`${path}.lock`);
      expect(lock.mode & 0o777).toBe(0o600);
      const owner = JSON.parse(await readFile(`${path}.lock`, "utf8")) as { pid: number };
      expect(owner.pid).toBe(process.pid);
    });
  });

  it("replaces a lock whose owner is dead and waits while the owner is alive", async () => {
    directory = await mkdtemp(join(tmpdir(), "visualizer-lock-"));
    const path = join(directory, "workspace.json");
    await writeFile(`${path}.lock`, JSON.stringify({ pid: 2147483646, starttime: "1" }), { mode: 0o600 });
    await expect(withFileLock(path, async () => "replaced")).resolves.toBe("replaced");

    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = withFileLock(path, () => held);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const pending = withFileLock(path, async () => "next");
    await new Promise((resolve) => setTimeout(resolve, 80));
    const owner = JSON.parse(await readFile(`${path}.lock`, "utf8")) as { pid: number };
    expect(owner.pid).toBe(process.pid);
    release();
    await holder;
    await expect(pending).resolves.toBe("next");
  });

  it("keeps a ledger append from a second process while a build tick is awaiting", async () => {
    directory = await mkdtemp(join(tmpdir(), "visualizer-writers-"));
    const path = join(directory, "workspace.json");
    await saveWorkspace(path, createSampleWorkspace());
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const router = new BrainRouter({
      prefer: 2,
      tier2: {
        complete: async () => {
          entered();
          await held;
          return JSON.stringify({
            route: "freehand-canvas",
            rank: 0.5,
            drift: false,
            reason: "Held so another process can append.",
          });
        },
      },
    });
    let memory = await loadWorkspace(path);
    const pending = runGuidedBuild(
      memory,
      router,
      () => memory,
      undefined,
      async (tick, startedVersion) => {
        const landed = await landWorkspaceTick(path, tick, startedVersion);
        memory = landed;
        return landed;
      },
    );
    await ready;
    const record: EnsemblyRecord = {
      id: "ens-concurrent",
      timestamp: "2026-11-27T12:09:00Z",
      kind: "rule",
      summary: "A second process appended this while the build was awaiting.",
      rationale: "The lock covers the save, not the tick.",
      provenance: "apps/mcp/src/workspace-file.test.ts",
      confirmedOutcome: null,
    };
    const child = spawn(process.execPath, ["--import", "tsx", "src/append-once.ts", path, JSON.stringify(record)], {
      cwd: mcpRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(code).toBe(0);
    release();
    const result = await pending;
    expect(result.ok).toBe(true);
    const saved = await loadWorkspace(path);
    expect(saved.ensemblyLedger.some((row) => row.id === "ens-concurrent")).toBe(true);
    expect(saved.autopilot.phase).not.toBe("idle");
    expect(saved.stateVersion).toBeGreaterThan(0);
  });
});
