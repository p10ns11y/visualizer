import { WorkspaceStateSchema, type WorkspaceState } from "./schema.js";

export const workspaceStorageKey = "visualizer.workspace";

export function serializeWorkspace(state: WorkspaceState): string {
  return JSON.stringify(WorkspaceStateSchema.parse(state));
}

export function readPersistedWorkspace(raw: string | null): WorkspaceState | null {
  if (!raw) return null;
  try {
    const parsed = WorkspaceStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
