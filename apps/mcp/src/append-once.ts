import { appendEnsemblyRecord, type EnsemblyRecord } from "@visualizer/core";
import { loadWorkspace, saveWorkspace, withFileLock } from "./workspace-file.js";

const path = process.argv[2];
const raw = process.argv[3];
if (!path || !raw) {
  console.error("usage: append-once <state> <json>");
  process.exit(2);
}

const record = JSON.parse(raw) as EnsemblyRecord;
await withFileLock(path, async () => {
  const state = await loadWorkspace(path);
  const result = appendEnsemblyRecord(state, state.stateVersion, record);
  if (!result.ok) {
    console.error(result.error.code);
    process.exit(1);
  }
  await saveWorkspace(path, result.state);
});
