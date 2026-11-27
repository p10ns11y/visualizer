import { zodToOpenAPISchema } from "@adaptate/utils";
import { z } from "zod";
import { appendEnsemblyRecord, recordWorkflowLesson } from "../memory/commit.js";
import { buildPulseInject } from "../memory/pulse-inject.js";
import { pauseRun, type CommitResult } from "../state/store.js";
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

export const webMcpToolNames = [
  "list_cards",
  "read_workspace",
  "read_pulse_memory",
  "read_pulse_inject",
  "read_workflow_lessons",
  "pause_build",
  "record_workflow_lesson",
  "append_ensembly_record",
] as const;

export type WebMcpToolName = (typeof webMcpToolNames)[number];

export type WebMcpApproval = "read-only" | "local";

export type WebMcpToolSummary = {
  name: WebMcpToolName;
  description: string;
  access: "read" | "write";
};

const EmptyInput = z.object({});
const PulseReadInput = z.object({
  inject: z.boolean().optional(),
});
const VersionInput = z.object({
  stateVersion: z.number().int().nonnegative(),
});
const LessonInput = WorkflowLessonSchema.extend({
  stateVersion: z.number().int().nonnegative(),
});
const EnsemblyInput = EnsemblyRecordSchema.extend({
  stateVersion: z.number().int().nonnegative(),
});

function copyRows<T extends object>(rows: readonly T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

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
    message: "External writes stay read only until this page grants local approval.",
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
        const entries = copyRows(deps.getState().pulseMemory);
        if (parsed.data.inject) return { ok: true, entries, inject: buildPulseInject(entries) };
        return { ok: true, entries };
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
      name: "read_workflow_lessons",
      description: "Reads workflow lessons recorded on this workspace.",
      inputSchema: jsonSchema(EmptyInput),
      annotations: { readOnlyHint: true },
      execute(input) {
        const parsed = EmptyInput.safeParse(input ?? {});
        if (!parsed.success) return invalid(parsed.error);
        return { ok: true, lessons: copyRows(deps.getState().workflowLessons) };
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
