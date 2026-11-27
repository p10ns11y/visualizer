import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const mcpRoot = fileURLToPath(new URL("..", import.meta.url));

type Stoppable = { stop: () => Promise<void> };

function spawnProcess(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ child: ChildProcess; stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: mcpRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ child, stdout, stderr, code }));
  });
}

function httpStatus(url: string, headers: Record<string, string>): Promise<number> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    req.on("error", reject);
    req.end("{}");
  });
}

async function startServer(env: NodeJS.ProcessEnv): Promise<Stoppable & { url: string; output: () => string }> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: mcpRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
    const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP server did not listen.\n${stderr}\n${stdout}`)), 15_000);
    const onExit = (code: number | null) => {
      clearTimeout(timer);
      reject(new Error(`MCP server exited ${code}.\n${stderr}\n${stdout}`));
    };
    child.once("exit", onExit);
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const match = /http:\/\/127\.0\.0\.1:\d+\/mcp/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        child.off("exit", onExit);
        resolve(match[0]);
      }
    });
  });
  let stopped = false;
  return {
    url,
    output: () => stdout + stderr,
    async stop() {
      if (stopped || child.exitCode !== null) return;
      stopped = true;
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        try {
          child.kill("SIGKILL");
        } catch {
          resolve();
        }
      });
    },
  };
}

function toolText(stdout: string): unknown {
  const parsed = JSON.parse(stdout) as { content?: Array<{ text?: string }> };
  const text = parsed.content?.[0]?.text;
  if (!text) throw new Error(`Client returned no text: ${stdout}`);
  return JSON.parse(text);
}

async function callTool(url: string, name: string, args: unknown, env: NodeJS.ProcessEnv = {}): Promise<unknown> {
  const result = await spawnProcess(
    ["--import", "tsx", "src/client-once.ts", url, name, JSON.stringify(args)],
    env,
  );
  expect(result.code, result.stderr).toBe(0);
  return toolText(result.stdout);
}

describe("external MCP client", () => {
  let directory = "";
  const servers: Stoppable[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = "";
  });

  it("shares a workspace file and keeps writes closed until a flag or token", async () => {
    directory = await mkdtemp(join(tmpdir(), "visualizer-mcp-"));
    const statePath = join(directory, "workspace.json");
    const closed = await startServer({
      VISUALIZER_MCP_PORT: "0",
      VISUALIZER_MCP_STATE: statePath,
      VISUALIZER_MCP_STATE_ROOT: directory,
      VISUALIZER_MCP_ALLOW_WRITES: "0",
    });
    servers.push(closed);
    const cards = await callTool(closed.url, "list_cards", {});
    expect(cards).toMatchObject({ ok: true });
    await expect(stat(statePath)).rejects.toMatchObject({ code: "ENOENT" });
    const badHost = await httpStatus(closed.url, { host: "evil.example" });
    const badOrigin = await httpStatus(closed.url, {
      host: `127.0.0.1:${new URL(closed.url).port}`,
      origin: "http://evil.example",
    });
    expect(badHost).toBe(403);
    expect(badOrigin).toBe(403);
    const denied = await callTool(closed.url, "append_ensembly_record", {
      stateVersion: 0,
      id: "ens-denied",
      timestamp: "2026-11-27T22:00:00Z",
      kind: "decision",
      summary: "Denied without approval.",
      rationale: "Writes are off.",
      provenance: "apps/mcp/src/server.e2e.test.ts",
      confirmedOutcome: null,
    });
    expect(denied).toMatchObject({ ok: false, code: "READ_ONLY" });
    await closed.stop();

    const flagged = await startServer({
      VISUALIZER_MCP_PORT: "0",
      VISUALIZER_MCP_STATE: statePath,
      VISUALIZER_MCP_STATE_ROOT: directory,
      VISUALIZER_MCP_ALLOW_WRITES: "1",
    });
    servers.push(flagged);
    const workspace = await callTool(flagged.url, "read_workspace", {});
    expect(workspace).toMatchObject({ ok: true, phase: "idle" });
    const version = (workspace as { stateVersion: number }).stateVersion;
    const appended = await callTool(flagged.url, "append_ensembly_record", {
      stateVersion: version,
      id: "ens-external",
      timestamp: "2026-11-27T22:00:01Z",
      kind: "rule",
      summary: "An external client appended this record.",
      rationale: "The file is the shared workspace.",
      provenance: "apps/mcp/src/server.e2e.test.ts",
      confirmedOutcome: "The external record is in Pulse Memory.",
    });
    expect(appended).toMatchObject({ ok: true, phase: "idle" });
    const written = await stat(statePath);
    const parent = await stat(dirname(statePath));
    expect(written.mode & 0o777).toBe(0o600);
    expect(parent.mode & 0o777).toBe(0o700);
    const second = await callTool(flagged.url, "read_ensembly_ledger", { limit: 20 });
    const records = (second as { records: Array<{ id: string }> }).records;
    expect(records.some((record) => record.id === "ens-external")).toBe(true);
    await flagged.stop();

    const token = "local-write-token";
    const locked = await startServer({
      VISUALIZER_MCP_PORT: "0",
      VISUALIZER_MCP_STATE: statePath,
      VISUALIZER_MCP_STATE_ROOT: directory,
      VISUALIZER_MCP_ALLOW_WRITES: "0",
      VISUALIZER_MCP_WRITE_TOKEN: token,
    });
    servers.push(locked);
    const noToken = await callTool(locked.url, "promote_record", {
      stateVersion: version,
      id: "ens-external",
    });
    expect(noToken).toMatchObject({ ok: false, code: "READ_ONLY" });
    const emptyBearer = await callTool(
      locked.url,
      "promote_record",
      { stateVersion: version, id: "ens-external" },
      { VISUALIZER_MCP_AUTHORIZATION: "Bearer " },
    );
    expect(emptyBearer).toMatchObject({ ok: false, code: "READ_ONLY" });
    expect(locked.output()).not.toContain(token);
    const promoted = await callTool(
      locked.url,
      "promote_record",
      { stateVersion: version, id: "ens-external" },
      { VISUALIZER_MCP_WRITE_TOKEN: token },
    );
    expect(promoted).toMatchObject({ ok: true, phase: "idle" });
    expect(locked.output()).not.toContain(token);
  });

  it("refuses a non-loopback bind and a state path outside the allowed root", async () => {
    const host = await spawnProcess(["--import", "tsx", "src/main.ts"], {
      VISUALIZER_MCP_HOST: "0.0.0.0",
      VISUALIZER_MCP_PORT: "0",
    });
    expect(host.code).not.toBe(0);
    expect(`${host.stderr}\n${host.stdout}`).toContain("127.0.0.1");
    expect(`${host.stderr}\n${host.stdout}`).not.toContain("VISUALIZER_MCP_WRITE_TOKEN");

    const outside = await spawnProcess(["--import", "tsx", "src/main.ts"], {
      VISUALIZER_MCP_PORT: "0",
      VISUALIZER_MCP_STATE: "/tmp/visualizer-outside-root/workspace.json",
      VISUALIZER_MCP_STATE_ROOT: mcpRoot,
    });
    expect(outside.code).not.toBe(0);
    expect(`${outside.stderr}\n${outside.stdout}`).toContain("VISUALIZER_MCP_STATE");
  });
});
