import { zodToOpenAPISchema } from "@adaptate/utils";
import { z } from "zod";
import { BrainRouter } from "../brain/router.js";
import { runGuidedBuild, type GuidedLanding } from "../bootstrap/guided.js";
import { appendEnsemblyRecord, importEnsemblyRecords, promoteEnsemblyRecord, recordWorkflowLesson } from "../memory/commit.js";
import { exportPulsePack, readPulsePack, recordsFromPack } from "../memory/ensembly.js";
import { buildPulseInject } from "../memory/pulse-inject.js";
import { proposeFleetAction } from "../fleet/propose.js";
import { buildCockpitSnapshot, type UiControlSnapshot } from "../fleet/snapshot.js";
import { pauseRun, resumeRun, type CommitResult } from "../state/store.js";
import {
  EnsemblyRecordSchema,
  WorkflowLessonSchema,
  workingPhases,
  type WorkspaceState,
} from "../state/schema.js";
import {
  detectModelContext,
  type ModelContextGlobals,
  type ModelContextHost,
  type WebMcpSource,
  type WebMcpTool,
} from "./model-context.js";
import { pageRows } from "./page.js";

export const webMcpToolNames = [
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
  "snapshot",
  "act",
] as const;

export const webMcpApprovalStorageKey = "visualizer.webmcp.approval";

export function approvalFromStorage(value: string | null): WebMcpApproval {
  return value === "local" ? "local" : "read-only";
}

export type WebMcpToolName = (typeof webMcpToolNames)[number];

export type WebMcpApproval = "read-only" | "local";

export type WebMcpToolSummary = {
  name: WebMcpToolName;
  description: string;
  access: "read" | "write";
};

const EmptyInput = z.object({});
const PageInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});
const PulseReadInput = PageInput.extend({
  inject: z.boolean().optional(),
});
const VersionInput = z.object({
  stateVersion: z.number().int().nonnegative(),
});
const PromoteInput = VersionInput.extend({
  id: z.string().min(1),
});
const ImportInput = VersionInput.extend({
  pack: z.unknown(),
});
const LessonInput = WorkflowLessonSchema.extend({
  stateVersion: z.number().int().nonnegative(),
});
const EnsemblyInput = EnsemblyRecordSchema.extend({
  stateVersion: z.number().int().nonnegative(),
});
const ActInput = z.object({
  stateVersion: z.number().int().nonnegative(),
  actionId: z.string().min(1).max(120),
});

export const webMcpInputSchemas: Record<WebMcpToolName, z.ZodType> = {
  list_cards: EmptyInput,
  read_workspace: EmptyInput,
  read_pulse_memory: PulseReadInput,
  read_pulse_inject: EmptyInput,
  read_ensembly_ledger: PageInput,
  read_workflow_lessons: PageInput,
  read_event_log: PageInput,
  pause_build: VersionInput,
  record_workflow_lesson: LessonInput,
  append_ensembly_record: EnsemblyInput,
  promote_record: PromoteInput,
  export_pulse_pack: EmptyInput,
  import_pulse_pack: ImportInput,
  start_build: VersionInput,
  resume_build: VersionInput,
  snapshot: EmptyInput,
  act: ActInput,
};

export type WebMcpToolResult =
  | { ok: true; [key: string]: unknown }
  | {
      ok: false;
      code: "READ_ONLY";
      message: string;
    }
  | {
      ok: false;
      code: "STATE_CONFLICT";
      expectedVersion: number;
      actualVersion: number;
    }
  | {
      ok: false;
      code: "INVALID_INPUT";
      message: string;
    }
  | {
      ok: false;
      code: "UNREGISTERED";
      name: string;
    }
  | {
      ok: false;
      code: "ILLEGAL_TRANSITION";
      from: string;
      event: string;
    };

export type WorkspaceBridge = {
  source: WebMcpSource;
  tools: readonly WebMcpToolSummary[];
  release: () => Promise<void>;
  execute: (name: string, input: unknown) => Promise<WebMcpToolResult>;
};

type BridgeDeps = {
  globals: ModelContextGlobals;
  getState: () => WorkspaceState;
  getApproval: () => WebMcpApproval;
  onCommit: (result: CommitResult) => void;
  landTick?: GuidedLanding;
  getUiSnapshot?: () => readonly UiControlSnapshot[];
};

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted: unknown = zodToOpenAPISchema(schema);
  if (!converted || typeof converted !== "object" || Array.isArray(converted)) {
    throw new Error("Tool input schema did not convert.");
  }
  return converted as Record<string, unknown>;
}

function invalid(error: z.ZodError): WebMcpToolResult {
  return { ok: false, code: "INVALID_INPUT", message: error.issues.map((issue) => issue.message).join(" ") };
}

function readOnly(): WebMcpToolResult {
  return {
    ok: false,
    code: "READ_ONLY",
    message: "External writes stay read only until local approval is on.",
  };
}

function fromCommit(result: CommitResult, onCommit: (result: CommitResult) => void): WebMcpToolResult {
  onCommit(result);
  if (!result.ok) {
    if (result.error.code === "STATE_CONFLICT") {
      return {
        ok: false,
        code: "STATE_CONFLICT",
        expectedVersion: result.error.expectedVersion,
        actualVersion: result.error.actualVersion,
      };
    }
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      from: result.error.from,
      event: result.error.event,
    };
  }
  return {
    ok: true,
    stateVersion: result.state.stateVersion,
    phase: result.state.autopilot.phase,
  };
}

function guardWrite(
  deps: BridgeDeps,
  expectedVersion: number,
): WebMcpToolResult | null {
  if (deps.getApproval() !== "local") return readOnly();
  const state = deps.getState();
  if (expectedVersion !== state.stateVersion) {
    const result: CommitResult = {
      ok: false,
      error: {
        code: "STATE_CONFLICT",
        expectedVersion,
        actualVersion: state.stateVersion,
      },
    };
    deps.onCommit(result);
    return {
      ok: false,
      code: "STATE_CONFLICT",
      expectedVersion,
      actualVersion: state.stateVersion,
    };
  }
  return null;
}

function workspaceTools(deps: BridgeDeps): WebMcpTool[] {
  const router = new BrainRouter({ prefer: 1 });
  return [
    {
      name: "list_cards",
      description: "Lists the problem cards on the shared workspace.",
      inputSchema: jsonSchema(EmptyInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = EmptyInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const state = deps.getState();
        return {
          ok: true,
          cards: state.problemCards.map((card) => ({
            id: card.id,
            title: card.title,
            statement: card.statement,
            acceptance: card.acceptance,
          })),
        };
      },
    },
    {
      name: "read_workspace",
      description: "Reads the railway phase and the current workspace version.",
      inputSchema: jsonSchema(EmptyInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = EmptyInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const state = deps.getState();
        return {
          ok: true,
          stateVersion: state.stateVersion,
          phase: state.autopilot.phase,
          mode: state.mode,
          banner: state.autopilot.banner,
        };
      },
    },
    {
      name: "read_pulse_memory",
      description: "Reads Pulse Memory notes kept on this workspace. Set inject to include the sparse pulse.",
      inputSchema: jsonSchema(PulseReadInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = PulseReadInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const state = deps.getState();
        if (parsed.data.inject) {
          return { ok: true, inject: buildPulseInject(state.pulseMemory) };
        }
        const page = pageRows(state.pulseMemory, parsed.data.limit, parsed.data.cursor);
        if ("error" in page) return { ok: false, code: "INVALID_INPUT", message: page.error };
        return { ok: true, entries: page.items, nextCursor: page.nextCursor };
      },
    },
    {
      name: "read_pulse_inject",
      description: "Reads the sparse pulse-pack-v1 inject, at most 8 traces inside the token budget.",
      inputSchema: jsonSchema(EmptyInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = EmptyInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        return { ok: true, inject: buildPulseInject(deps.getState().pulseMemory) };
      },
    },
    {
      name: "read_ensembly_ledger",
      description: "Reads the Ensembly ledger one page at a time.",
      inputSchema: jsonSchema(PageInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = PageInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const page = pageRows(deps.getState().ensemblyLedger, parsed.data.limit, parsed.data.cursor);
        if ("error" in page) return { ok: false, code: "INVALID_INPUT", message: page.error };
        return { ok: true, records: page.items, nextCursor: page.nextCursor };
      },
    },
    {
      name: "read_workflow_lessons",
      description: "Reads workflow lessons recorded on this workspace.",
      inputSchema: jsonSchema(PageInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = PageInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const page = pageRows(deps.getState().workflowLessons, parsed.data.limit, parsed.data.cursor);
        if ("error" in page) return { ok: false, code: "INVALID_INPUT", message: page.error };
        return { ok: true, lessons: page.items, nextCursor: page.nextCursor };
      },
    },
    {
      name: "read_event_log",
      description: "Reads the workspace event log one page at a time.",
      inputSchema: jsonSchema(PageInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = PageInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const page = pageRows(deps.getState().eventLog, parsed.data.limit, parsed.data.cursor);
        if ("error" in page) return { ok: false, code: "INVALID_INPUT", message: page.error };
        return { ok: true, events: page.items, nextCursor: page.nextCursor };
      },
    },
    {
      name: "pause_build",
      description: "Pauses a working build when this page has granted local approval.",
      inputSchema: jsonSchema(VersionInput),
      annotations: { readOnlyHint: false },
      execute(input) {
        const parsed = VersionInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        const state = deps.getState();
        if (!workingPhases.includes(state.autopilot.phase)) {
          return fromCommit({ ok: true, state }, deps.onCommit);
        }
        return fromCommit(pauseRun(state, parsed.data.stateVersion), deps.onCommit);
      },
    },
    {
      name: "record_workflow_lesson",
      description: "Records a workflow lesson when this page has granted local approval.",
      inputSchema: jsonSchema(LessonInput),
      annotations: { readOnlyHint: false },
      execute(input) {
        const parsed = LessonInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        const { stateVersion, ...lesson } = parsed.data;
        return fromCommit(
          recordWorkflowLesson(deps.getState(), stateVersion, lesson),
          deps.onCommit,
        );
      },
    },
    {
      name: "append_ensembly_record",
      description: "Appends one Ensembly shared-log record when this page has granted local approval.",
      inputSchema: jsonSchema(EnsemblyInput),
      annotations: { readOnlyHint: false },
      execute(input) {
        const parsed = EnsemblyInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        const { stateVersion, ...record } = parsed.data;
        return fromCommit(
          appendEnsemblyRecord(deps.getState(), stateVersion, record),
          deps.onCommit,
        );
      },
    },
    {
      name: "promote_record",
      description: "Promotes one ledger record into Pulse Memory when local approval is on. Does not pause the railway.",
      inputSchema: jsonSchema(PromoteInput),
      annotations: { readOnlyHint: false },
      execute(input) {
        const parsed = PromoteInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        return fromCommit(
          promoteEnsemblyRecord(deps.getState(), parsed.data.stateVersion, parsed.data.id),
          deps.onCommit,
        );
      },
    },
    {
      name: "export_pulse_pack",
      description: "Exports the ledger as a Canon 1 pulse-pack-v1 object.",
      inputSchema: jsonSchema(EmptyInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = EmptyInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const state = deps.getState();
        return {
          ok: true,
          pack: exportPulsePack(state.ensemblyLedger, {
            exportedAt: new Date().toISOString(),
            sourceHost: "visualizer",
          }),
        };
      },
    },
    {
      name: "import_pulse_pack",
      description: "Merges a pulse pack into the ledger when local approval is on. Does not pause the railway.",
      inputSchema: jsonSchema(ImportInput),
      annotations: { readOnlyHint: false },
      execute(input) {
        const parsed = ImportInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        let pack;
        try {
          pack = readPulsePack(parsed.data.pack);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Ensembly pulse pack is not readable.";
          return { ok: false, code: "INVALID_INPUT", message };
        }
        const imported = importEnsemblyRecords(
          deps.getState(),
          parsed.data.stateVersion,
          recordsFromPack(pack),
        );
        const committed = fromCommit(imported, deps.onCommit);
        if (!committed.ok) return committed;
        return {
          ...committed,
          added: imported.added ?? 0,
          skipped: imported.skipped ?? 0,
          conflicts: imported.conflicts ?? 0,
        };
      },
    },
    {
      name: "start_build",
      description: "Starts the railway from idle and runs the build ticks when local approval is on.",
      inputSchema: jsonSchema(VersionInput),
      annotations: { readOnlyHint: false },
      async execute(input) {
        const parsed = VersionInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        const state = deps.getState();
        if (state.autopilot.phase !== "idle") {
          return {
            ok: true,
            stateVersion: state.stateVersion,
            phase: state.autopilot.phase,
            started: false,
          };
        }
        return fromCommit(
          await runGuidedBuild(
            state,
            router,
            deps.getState,
            (next) => {
              deps.onCommit({ ok: true, state: next });
            },
            deps.landTick,
          ),
          deps.onCommit,
        );
      },
    },
    {
      name: "resume_build",
      description: "Resumes a human pause and continues the build ticks when local approval is on.",
      inputSchema: jsonSchema(VersionInput),
      annotations: { readOnlyHint: false },
      async execute(input) {
        const parsed = VersionInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        const state = deps.getState();
        if (state.autopilot.phase !== "paused_by_human") {
          return {
            ok: true,
            stateVersion: state.stateVersion,
            phase: state.autopilot.phase,
            resumed: false,
          };
        }
        const resumed = resumeRun(state, parsed.data.stateVersion);
        if (!resumed.ok) return fromCommit(resumed, deps.onCommit);
        deps.onCommit(resumed);
        return fromCommit(
          await runGuidedBuild(
            resumed.state,
            router,
            deps.getState,
            (next) => {
              deps.onCommit({ ok: true, state: next });
            },
            deps.landTick,
          ),
          deps.onCommit,
        );
      },
    },
    {
      name: "snapshot",
      description: "Reads a compact typed cockpit snapshot: fleet ids, findings, action ids, and ui-sdk control refs.",
      inputSchema: jsonSchema(EmptyInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = EmptyInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const controls = deps.getUiSnapshot?.() ?? [];
        return { ok: true, snapshot: buildCockpitSnapshot(deps.getState(), controls) };
      },
    },
    {
      name: "act",
      description: "Files a pending fleet proposal for an action id when local approval is on. It does not change the fleet graph.",
      inputSchema: jsonSchema(ActInput),
      annotations: { readOnlyHint: false },
      execute(input) {
        const parsed = ActInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        const denied = guardWrite(deps, parsed.data.stateVersion);
        if (denied) return denied;
        const proposed = proposeFleetAction(
          deps.getState(),
          parsed.data.stateVersion,
          parsed.data.actionId,
          new Date().toISOString(),
        );
        if (!proposed.ok) {
          if ("code" in proposed && proposed.code === "UNKNOWN_ACTION") {
            return { ok: false, code: "INVALID_INPUT", message: `Unknown action ${proposed.actionId}.` };
          }
          if ("code" in proposed && proposed.code === "DUPLICATE_PROPOSAL") {
            return {
              ok: false,
              code: "INVALID_INPUT",
              message: `Pending proposal ${proposed.proposalId} already covers ${proposed.actionId}.`,
            };
          }
          return fromCommit(proposed, deps.onCommit);
        }
        const committed = fromCommit(proposed, deps.onCommit);
        if (!committed.ok) return committed;
        const pending = [...proposed.state.fleetProposals]
          .reverse()
          .find((item) => item.actionId === parsed.data.actionId && item.status === "pending");
        return { ...committed, proposalId: pending?.id ?? null, status: pending?.status ?? null };
      },
    },
  ];
}

function summaries(tools: readonly WebMcpTool[]): WebMcpToolSummary[] {
  return tools.map((tool) => {
    const name = tool.name as WebMcpToolName;
    return {
      name,
      description: tool.description,
      access: tool.annotations?.readOnlyHint === false ? "write" : "read",
    };
  });
}

async function releaseHost(
  host: ModelContextHost,
  names: readonly string[],
  controller: AbortController,
): Promise<void> {
  if (!controller.signal.aborted) controller.abort();
  if (typeof host.unregisterTool !== "function") return;
  for (const name of names) {
    try {
      await host.unregisterTool(name);
    } catch {
      // A current host already dropped the tool when the signal aborted.
    }
  }
}

export function describeWebMcpBridge(
  source: WebMcpSource,
  approval: WebMcpApproval,
): { heading: string; detail: string } {
  const boundary =
    approval === "local"
      ? "Local approval is on."
      : "External writes are read only.";
  switch (source) {
    case "document":
      return { heading: "Native WebMCP", detail: `document.modelContext. ${boundary}` };
    case "navigator":
      return { heading: "Native WebMCP", detail: `navigator.modelContext. ${boundary}` };
    case "local":
      return { heading: "Local bridge", detail: `In-app inspector. ${boundary}` };
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

export async function mountWorkspaceBridge(deps: BridgeDeps): Promise<WorkspaceBridge> {
  const detected = detectModelContext(deps.globals);
  const controller = new AbortController();
  const tools = workspaceTools(deps);
  const names: string[] = [];
  try {
    for (const tool of tools) {
      await detected.host.registerTool(tool, { signal: controller.signal });
      names.push(tool.name);
    }
  } catch (error) {
    await releaseHost(detected.host, names, controller);
    throw error;
  }
  let released = false;

  return {
    source: detected.source,
    tools: summaries(tools),
    async release() {
      if (released) return;
      released = true;
      await releaseHost(detected.host, names, controller);
    },
    async execute(name, input) {
      const tool = tools.find((entry) => entry.name === name);
      if (!tool || controller.signal.aborted) {
        return { ok: false, code: "UNREGISTERED", name };
      }
      try {
        if (typeof detected.host.executeTool === "function") {
          const value: unknown = await detected.host.executeTool(name, input);
          return value as WebMcpToolResult;
        }
        const value: unknown = await tool.execute(input, { signal: controller.signal });
        return value as WebMcpToolResult;
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return { ok: false, code: "UNREGISTERED", name };
        }
        throw error;
      }
    },
  };
}
