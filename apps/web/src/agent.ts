import { createAgent, registerTools } from "@ui-sdk/react/agent";
import { allowComponentAction } from "./allow.js";

export const agent = createAgent({ allow: allowComponentAction });

export function connectModelContext(host: object): () => void {
  const context = (host as { modelContext?: { registerTool?: unknown } }).modelContext;
  if (typeof context?.registerTool !== "function") return () => {};
  return registerTools(agent, { allow: allowComponentAction });
}
