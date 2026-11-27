import { describe, expect, it } from "vitest";
import { applyPilotEvent, assertCommit } from "../state/store.js";
import { createSampleWorkspace } from "../state/sample.js";
import {
  describeWebMcpBridge,
  mountWorkspaceBridge,
  webMcpToolNames,
  type WebMcpApproval,
} from "./bridge.js";
import {
  createLocalModelContext,
  detectModelContext,
  type ModelContextHost,
  type WebMcpTool,
} from "./model-context.js";
import type { CommitResult } from "../state/store.js";

function session(options?: { approval?: WebMcpApproval; globals?: Parameters<typeof mountWorkspaceBridge>[0]["globals"] }) {
  let state = createSampleWorkspace();
  let approval: WebMcpApproval = options?.approval ?? "read-only";
  const commits: CommitResult[] = [];
  return {
    get state() {
      return state;
    },
    setApproval(next: WebMcpApproval) {
      approval = next;
    },
    commits,
    async mount() {
      return mountWorkspaceBridge({
        globals: options?.globals ?? {},
        getState: () => state,
        getApproval: () => approval,
        onCommit: (result) => {
          commits.push(result);
          if (result.ok) state = result.state;
        },
      });
    },
  };
}

function legacyHost(): ModelContextHost & { names: () => string[] } {
  const tools = new Map<string, WebMcpTool>();
  return {
    async registerTool(tool) {
      tools.set(tool.name, tool);
    },
    async unregisterTool(name) {
      tools.delete(name);
    },
    async executeTool(name, input) {
      const tool = tools.get(name);
      if (!tool) {
        const error = new Error(`Unknown tool ${name}`);
        error.name = "NotFoundError";
        throw error;
      }
      return tool.execute(input, { signal: new AbortController().signal });
    },
    names() {
      return [...tools.keys()];
    },
  };
}

describe("modelContext detection", () => {
  it("uses a local bridge when modelContext is absent", () => {
    const detected = detectModelContext({});
    expect(detected.source).toBe("local");
    expect(describeWebMcpBridge(detected.source, "read-only").heading).toBe("Local bridge");
  });

  it("prefers document.modelContext over navigator.modelContext", () => {
    const documentHost = createLocalModelContext();
    const navigatorHost = createLocalModelContext();
    const detected = detectModelContext({
      document: { modelContext: documentHost },
      navigator: { modelContext: navigatorHost },
    });
    expect(detected.source).toBe("document");
    expect(detected.host).toBe(documentHost);
  });

  it("reads navigator.modelContext when the document getter is missing", () => {
    const navigatorHost = createLocalModelContext();
    const detected = detectModelContext({ navigator: { modelContext: navigatorHost } });
    expect(detected.source).toBe("navigator");
    expect(describeWebMcpBridge("navigator", "local").detail).toContain("navigator.modelContext");
  });
});

describe("workspace WebMCP tools", () => {
  it("registers read tools and invokes them on the local bridge", async () => {
    const harness = session();
    const bridge = await harness.mount();
    expect(bridge.source).toBe("local");
    expect(bridge.tools.map((tool) => tool.name)).toEqual([
      "list_cards",
      "read_workspace",
      "read_pulse_memory",
      "read_pulse_inject",
      "read_ensembly_ledger",
      "read_workflow_lessons",
      "read_event_log",
      "pause_build",
      "record_workflow_lesson",
      "append_ensembly_record",
      "promote_record",
      "export_pulse_pack",
      "import_pulse_pack",
      "start_build",
      "resume_build",
    ]);
    const cards = await bridge.execute("list_cards", {});
    expect(cards).toMatchObject({ ok: true });
    if (!cards.ok) return;
    const listed = cards.cards as Array<{ title: string }>;
    expect(listed.map((card) => card.title)).toContain("Ensembly shared log");
    const workspace = await bridge.execute("read_workspace", {});
    expect(workspace).toMatchObject({
      ok: true,
      stateVersion: 0,
      phase: "idle",
    });
    const pulse = await bridge.execute("read_pulse_memory", {});
    expect(pulse).toMatchObject({ ok: true });
    if (!pulse.ok) return;
    const entries = pulse.entries as Array<{ id: string; summary: string }>;
    expect(entries.map((entry) => entry.id)).toEqual(["ens-rule-stateversion"]);
    entries[0]!.summary = "mutated";
    expect(harness.state.pulseMemory[0]?.summary).toBe(
      "A stale stateVersion never overwrites the workspace.",
    );
    const ledger = await bridge.execute("read_ensembly_ledger", { limit: 1 });
    expect(ledger).toMatchObject({ ok: true, nextCursor: "1" });
    if (!ledger.ok) return;
    const first = ledger.records as Array<{ id: string }>;
    expect(first).toHaveLength(1);
    const nextLedger = await bridge.execute("read_ensembly_ledger", { limit: 1, cursor: "1" });
    expect(nextLedger).toMatchObject({ ok: true });
    if (!nextLedger.ok) return;
    const second = nextLedger.records as Array<{ id: string }>;
    expect(second[0]?.id).not.toBe(first[0]?.id);
    const lessons = await bridge.execute("read_workflow_lessons", {});
    expect(lessons).toMatchObject({
      ok: true,
      lessons: [expect.objectContaining({ id: "lesson-planning-bridge" })],
    });
    const schema = bridge.tools.find((tool) => tool.name === "pause_build");
    expect(schema?.access).toBe("write");
  });

  it("starts a build from idle when local approval is on", async () => {
    let state = createSampleWorkspace();
    const bridge = await mountWorkspaceBridge({
      globals: {},
      getState: () => state,
      getApproval: () => "local",
      onCommit: (result) => {
        if (result.ok) state = result.state;
      },
    });
    const started = await bridge.execute("start_build", { stateVersion: state.stateVersion });
    expect(started).toMatchObject({ ok: true, phase: "completed" });
    expect(state.autopilot.phase).toBe("completed");
    expect(state.brief?.verified).toBe(true);
  });

  it("rejects external writes until local approval", async () => {
    const harness = session();
    const bridge = await harness.mount();
    const denied = await bridge.execute("pause_build", { stateVersion: 0 });
    expect(denied).toMatchObject({ ok: false, code: "READ_ONLY" });
    expect(harness.commits).toHaveLength(0);
    expect(harness.state.stateVersion).toBe(0);
  });

  it("rejects a stale stateVersion with STATE_CONFLICT", async () => {
    let state = assertCommit(
      applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }),
    );
    const bridge = await mountWorkspaceBridge({
      globals: {},
      getState: () => state,
      getApproval: () => "local",
      onCommit: (result) => {
        if (result.ok) state = result.state;
      },
    });
    const stale = await bridge.execute("pause_build", { stateVersion: 0 });
    expect(stale).toMatchObject({
      ok: false,
      code: "STATE_CONFLICT",
      expectedVersion: 0,
      actualVersion: state.stateVersion,
    });
    expect(state.autopilot.phase).toBe("planning");
    const lesson = await bridge.execute("record_workflow_lesson", {
      stateVersion: 0,
      id: "lesson-stale",
      recordedAt: "2026-11-27T12:00:00Z",
      phase: "planning",
      cardId: "card-bridge",
      signal: "friction",
      lesson: "Stale lesson",
      adjustment: "Do not record it.",
    });
    expect(lesson).toMatchObject({ ok: false, code: "STATE_CONFLICT" });
    expect(state.workflowLessons).toHaveLength(1);
  });

  it("pauses, records a lesson, and appends an Ensembly record at the current version", async () => {
    let state = assertCommit(
      applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }),
    );
    const bridge = await mountWorkspaceBridge({
      globals: {},
      getState: () => state,
      getApproval: () => "local",
      onCommit: (result) => {
        if (result.ok) state = result.state;
      },
    });
    const paused = await bridge.execute("pause_build", { stateVersion: state.stateVersion });
    expect(paused).toMatchObject({ ok: true, phase: "paused_by_human" });
    const recorded = await bridge.execute("record_workflow_lesson", {
      stateVersion: state.stateVersion,
      id: "lesson-webmcp",
      recordedAt: "2026-11-27T12:00:00Z",
      phase: "paused_by_human",
      cardId: "card-bridge",
      signal: "friction",
      lesson: "Pause before the next tick.",
      adjustment: "Read the card before publishing.",
    });
    expect(recorded).toMatchObject({ ok: true, phase: "paused_by_human" });
    expect(state.workflowLessons.at(-1)?.lesson).toBe("Pause before the next tick.");
    const running = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    const live = await mountWorkspaceBridge({
      globals: {},
      getState: () => running,
      getApproval: () => "local",
      onCommit: (result) => {
        if (result.ok) Object.assign(running, result.state);
      },
    });
    const version = running.stateVersion;
    const during = await live.execute("record_workflow_lesson", {
      stateVersion: version,
      id: "lesson-while-planning",
      recordedAt: "2026-11-27T12:01:00Z",
      phase: "planning",
      cardId: "card-bridge",
      signal: "adjustment",
      lesson: "Leave the working phase running.",
      adjustment: "Write the lesson on the aux layer.",
    });
    expect(during).toMatchObject({ ok: true, phase: "planning", stateVersion: version });
    expect(running.autopilot.phase).toBe("planning");
    expect(running.workflowLessons.some((lesson) => lesson.id === "lesson-while-planning")).toBe(true);
    const appendedLive = await live.execute("append_ensembly_record", {
      stateVersion: version,
      id: "ens-while-planning",
      timestamp: "2026-11-27T12:01:01Z",
      kind: "decision",
      summary: "Ledger writes leave the railway running.",
      rationale: "Only an explicit pause stops the build.",
      provenance: "packages/core/src/webmcp/bridge.test.ts",
      confirmedOutcome: null,
    });
    expect(appendedLive).toMatchObject({ ok: true, phase: "planning", stateVersion: version });
    expect(running.autopilot.phase).toBe("planning");
    const appended = await bridge.execute("append_ensembly_record", {
      stateVersion: state.stateVersion,
      id: "ens-webmcp",
      timestamp: "2026-11-27T12:00:01Z",
      kind: "decision",
      summary: "Planning paused.",
      rationale: "The person stopped the run.",
      provenance: "packages/core/src/webmcp/bridge.ts",
      confirmedOutcome: null,
    });
    expect(appended).toMatchObject({ ok: true });
    expect(state.ensemblyLedger.at(-1)).toMatchObject({
      id: "ens-webmcp",
      summary: "Planning paused.",
    });
    const inject = await bridge.execute("read_pulse_inject", {});
    expect(inject).toMatchObject({
      ok: true,
      inject: { schema: "pulse-pack-v1", limit: 8, token_budget: 120 },
    });
    const withInject = await bridge.execute("read_pulse_memory", { inject: true });
    expect(withInject).toMatchObject({ ok: true, inject: { schema: "pulse-pack-v1" } });
    expect(withInject).not.toHaveProperty("entries");
    const lessons = await bridge.execute("read_workflow_lessons", {});
    expect(lessons).toMatchObject({
      ok: true,
      lessons: expect.arrayContaining([
        expect.objectContaining({ lesson: "Pause before the next tick." }),
      ]),
    });
  });

  it("drops tools on release when the host only supports the signal", async () => {
    const host = createLocalModelContext();
    const bridge = await mountWorkspaceBridge({
      globals: { document: { modelContext: host } },
      getState: createSampleWorkspace,
      getApproval: () => "read-only",
      onCommit: () => undefined,
    });
    expect(bridge.source).toBe("document");
    expect(host.listNames()).toHaveLength(webMcpToolNames.length);
    expect(host.getTools?.().find((tool) => tool.name === "pause_build")?.inputSchema).toMatchObject({
      type: "object",
      required: ["stateVersion"],
    });
    await bridge.release();
    expect(host.listNames()).toHaveLength(0);
    await bridge.release();
    expect(await bridge.execute("list_cards", {})).toMatchObject({
      ok: false,
      code: "UNREGISTERED",
    });
  });

  it("calls unregisterTool on a host that does not watch the signal", async () => {
    const host = legacyHost();
    const bridge = await mountWorkspaceBridge({
      globals: { navigator: { modelContext: host } },
      getState: createSampleWorkspace,
      getApproval: () => "local",
      onCommit: () => undefined,
    });
    expect(bridge.source).toBe("navigator");
    expect(host.names()).toContain("append_ensembly_record");
    await bridge.release();
    expect(host.names()).toHaveLength(0);
  });

  it("does not call provideContext", async () => {
    const host = createLocalModelContext();
    let provided = 0;
    const withProvide = Object.assign(host, {
      provideContext() {
        provided += 1;
      },
    });
    await mountWorkspaceBridge({
      globals: { document: { modelContext: withProvide } },
      getState: createSampleWorkspace,
      getApproval: () => "read-only",
      onCommit: () => undefined,
    });
    expect(provided).toBe(0);
  });

  it("unregisters tools already added when a later registerTool throws", async () => {
    const kept = new Map<string, string>();
    const host: ModelContextHost = {
      async registerTool(tool, options) {
        if (tool.name === "pause_build") throw new Error("register failed");
        kept.set(tool.name, tool.name);
        options?.signal?.addEventListener("abort", () => kept.delete(tool.name), { once: true });
      },
      unregisterTool(name) {
        kept.delete(name);
      },
    };
    await expect(
      mountWorkspaceBridge({
        globals: { document: { modelContext: host } },
        getState: createSampleWorkspace,
        getApproval: () => "read-only",
        onCommit: () => undefined,
      }),
    ).rejects.toThrow("register failed");
    expect([...kept.keys()]).toEqual([]);
  });
});
