import { WorkspaceStateSchema, type WorkspaceState } from "./schema.js";

export const workspaceStorageKey = "visualizer.workspace";

export const legacyWorkspaceStorageKey = "visualizer.workspace.v1";

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

export function readWorkspaceStorage(
  getItem: (key: string) => string | null,
): WorkspaceState | null {
  return (
    readPersistedWorkspace(getItem(workspaceStorageKey)) ??
    readPersistedWorkspace(getItem(legacyWorkspaceStorageKey))
  );
}
