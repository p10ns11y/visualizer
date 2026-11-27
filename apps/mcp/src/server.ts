import { timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import {
  mountWorkspaceBridge,
  webMcpInputSchemas,
  webMcpToolNames,
  type WebMcpApproval,
  type WebMcpToolResult,
} from "@visualizer/core";
import { loadWorkspace, saveWorkspace, withFileLock } from "./workspace-file.js";

export type McpServerOptions = {
  statePath: string;
  port: number;
  allowWrites: boolean;
  writeToken: string | null;
};

const approvalStore = new AsyncLocalStorage<WebMcpApproval>();

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function bearerMatches(header: string | undefined, token: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;
  const presented = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

export function approvalForRequest(header: string | undefined, options: Pick<McpServerOptions, "allowWrites" | "writeToken">): WebMcpApproval {
  if (options.writeToken) return bearerMatches(header, options.writeToken) ? "local" : "read-only";
  return options.allowWrites ? "local" : "read-only";
}

async function callTool(
  statePath: string,
  name: string,
  input: unknown,
  approval: WebMcpApproval,
): Promise<WebMcpToolResult> {
  return withFileLock(statePath, async () => {
    let state = await loadWorkspace(statePath);
    const bridge = await mountWorkspaceBridge({
      globals: {},
      getState: () => state,
      getApproval: () => approval,
      onCommit: (result) => {
        if (result.ok) state = result.state;
      },
    });
    try {
      const result = await bridge.execute(name, input);
      await saveWorkspace(statePath, state);
      return result;
    } finally {
      await bridge.release();
    }
  });
}

export async function startMcpServer(options: McpServerOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const described = await mountWorkspaceBridge({
    globals: {},
    getState: () => {
      throw new Error("Description mount does not read state.");
    },
    getApproval: () => "read-only",
    onCommit: () => undefined,
  });
  const descriptions = new Map(described.tools.map((tool) => [tool.name, tool.description]));
  await described.release();

  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "visualizer", version: "0.1.0" });
    for (const name of webMcpToolNames) {
      server.registerTool(
        name,
        {
          description: descriptions.get(name) ?? name,
          inputSchema: webMcpInputSchemas[name],
        },
        async (args: unknown) => {
          const approval = approvalStore.getStore() ?? "read-only";
          const result = await callTool(options.statePath, name, args ?? {}, approval);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            isError: !result.ok,
          };
        },
      );
    }
    return server;
  });

  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const http: Server = createServer((request, response) => {
    if (!validateHost(request, response) || !validateOrigin(request, response)) return;
    const path = request.url?.split("?")[0] ?? "";
    if (path !== "/mcp") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Not found." }));
      return;
    }
    const approval = approvalForRequest(headerValue(request.headers.authorization), options);
    approvalStore.run(approval, () => {
      void nodeHandler(request, response);
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, "127.0.0.1", () => {
      http.off("error", reject);
      resolve();
    });
  });

  const address = http.address();
  const port = address && typeof address === "object" ? address.port : options.port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export function readMcpEnv(env: NodeJS.ProcessEnv = process.env): McpServerOptions {
  const host = env.VISUALIZER_MCP_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1") {
    throw new Error("The MCP server binds to 127.0.0.1 only.");
  }
  const port = Number(env.VISUALIZER_MCP_PORT ?? "8787");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("VISUALIZER_MCP_PORT must be an integer from 0 to 65535.");
  }
  const token = env.VISUALIZER_MCP_WRITE_TOKEN;
  return {
    statePath: env.VISUALIZER_MCP_STATE ?? ".visualizer/workspace.json",
    port,
    allowWrites: env.VISUALIZER_MCP_ALLOW_WRITES === "1",
    writeToken: token && token.length > 0 ? token : null,
  };
}
