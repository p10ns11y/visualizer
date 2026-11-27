import { zodToOpenAPISchema } from "@adaptate/utils";
import { z } from "zod";
import type { BuildBrief } from "../state/schema.js";

export const runnerIds = ["cursor", "claude-code", "codex"] as const;
export type RunnerId = (typeof runnerIds)[number];

export const ToolHandoffSchema = z.object({
  briefTitle: z.string().min(1),
  verified: z.boolean(),
  route: z.string().min(1),
});

export interface ToolRunRequest {
  brief: BuildBrief;
}

export interface ToolRunResult {
  runnerId: RunnerId;
  accepted: boolean;
  summary: string;
}

export interface LocalToolRunner {
  id: RunnerId;
  label: string;
  probe(): Promise<boolean>;
  handoff(request: ToolRunRequest): Promise<ToolRunResult>;
}

const runnerLabels: Record<RunnerId, string> = {
  cursor: "Cursor",
  "claude-code": "Claude Code",
  codex: "Codex",
};

export function createInProcessRunner(id: RunnerId): LocalToolRunner {
  return {
    id,
    label: runnerLabels[id],
    async probe() {
      return true;
    },
    async handoff(request) {
      const payload = ToolHandoffSchema.parse({
        briefTitle: request.brief.title,
        verified: request.brief.verified,
        route: request.brief.route,
      });
      if (!payload.verified) {
        return {
          runnerId: id,
          accepted: false,
          summary: `${runnerLabels[id]} declined an unverified brief.`,
        };
      }
      return {
        runnerId: id,
        accepted: true,
        summary: `${runnerLabels[id]} accepted ${payload.briefTitle} on route ${payload.route}.`,
      };
    },
  };
}

export const connectorIds = [
  "github",
  "vercel",
  "greenhouse",
  "workspace",
  "ashby",
] as const;
export type ConnectorId = (typeof connectorIds)[number];

const toolInput = z.object({
  workspaceVersion: z.number().int().nonnegative(),
  summary: z.string().min(1),
});

export type ConnectorContract = {
  id: ConnectorId;
  purpose: string;
  tool: string;
  inputSchema: ReturnType<typeof zodToOpenAPISchema>;
};

const connectorCopy: Record<ConnectorId, { purpose: string; tool: string }> = {
  github: {
    purpose: "Read repositories and open pull requests from the brief.",
    tool: "github.create_pull_request",
  },
  vercel: {
    purpose: "Read project runtime state for the cockpit.",
    tool: "vercel.read_project",
  },
  greenhouse: {
    purpose: "Read hiring pipeline context when a card asks for it.",
    tool: "greenhouse.read_opening",
  },
  workspace: {
    purpose: "Read and write the shared document workspace.",
    tool: "workspace.read_page",
  },
  ashby: {
    purpose: "Read candidate pipeline context when a card asks for it.",
    tool: "ashby.read_opening",
  },
};

export function connectorCatalog(): ConnectorContract[] {
  return connectorIds.map((id) => ({
    id,
    purpose: connectorCopy[id].purpose,
    tool: connectorCopy[id].tool,
    inputSchema: zodToOpenAPISchema(toolInput),
  }));
}

export const localRunners: LocalToolRunner[] = runnerIds.map((id) =>
  createInProcessRunner(id),
);
