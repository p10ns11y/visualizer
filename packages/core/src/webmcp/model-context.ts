export type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: unknown, options: { signal: AbortSignal }) => Promise<unknown> | unknown;
};

export type ModelContextHost = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void> | void;
  unregisterTool?: (name: string) => Promise<void> | void;
  getTools?: () => WebMcpTool[];
  executeTool?: (name: string, input: unknown) => Promise<unknown>;
};

export type ModelContextGlobals = {
  document?: { modelContext?: ModelContextHost | null } | null;
  navigator?: { modelContext?: ModelContextHost | null } | null;
};

export type WebMcpSource = "document" | "navigator" | "local";

export type LocalModelContext = ModelContextHost & {
  listNames: () => string[];
};

function isHost(value: unknown): value is ModelContextHost {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { registerTool?: unknown }).registerTool === "function";
}

export function createLocalModelContext(): LocalModelContext {
  const tools = new Map<string, WebMcpTool>();

  return {
    async registerTool(tool, options) {
      if (options?.signal?.aborted) return;
      if (tools.has(tool.name)) {
        const error = new Error(`Tool ${tool.name} is already registered.`);
        error.name = "InvalidStateError";
        throw error;
      }
      tools.set(tool.name, tool);
      options?.signal?.addEventListener(
        "abort",
        () => {
          tools.delete(tool.name);
        },
        { once: true },
      );
    },
    unregisterTool(name) {
      tools.delete(name);
    },
    getTools() {
      return [...tools.values()];
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
    listNames() {
      return [...tools.keys()];
    },
  };
}

export function detectModelContext(globals: ModelContextGlobals): {
  source: WebMcpSource;
  host: ModelContextHost;
} {
  const documentHost = globals.document?.modelContext;
  if (isHost(documentHost)) return { source: "document", host: documentHost };
  const navigatorHost = globals.navigator?.modelContext;
  if (isHost(navigatorHost)) return { source: "navigator", host: navigatorHost };
  return { source: "local", host: createLocalModelContext() };
}

export function readModelContextGlobals(): ModelContextGlobals {
  const host = globalThis as {
    document?: { modelContext?: ModelContextHost | null };
    navigator?: { modelContext?: ModelContextHost | null };
  };
  return { document: host.document, navigator: host.navigator };
}
