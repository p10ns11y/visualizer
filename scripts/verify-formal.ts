import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flowMachineJson } from "../packages/core/src/formal/export-machine.ts";
import { checkFlowGraph, flowGraphBounds } from "../packages/core/src/formal/flow-graph.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formalDir = path.join(root, "packages/core/src/formal");
const require = createRequire(path.join(root, "packages/core/package.json"));
const xstateRoot = path.dirname(require.resolve("xstate/package.json"));
const xstateBin = path.join(xstateRoot, "bin/xstate.js");
const xstateVersion = (require(path.join(xstateRoot, "package.json")) as { version: string })
  .version;

const directory = mkdtempSync(path.join(tmpdir(), "visualizer-formal-"));
const machinePath = path.join(directory, "flow.json");
writeFileSync(machinePath, flowMachineJson());

function runXstate(args: string[]) {
  const result = spawnSync(process.execPath, [xstateBin, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`xstate ${args[0]} failed`);
  }
  const parsed = JSON.parse(result.stdout) as { ok?: boolean; command?: string };
  if (parsed.ok !== true) {
    throw new Error(result.stdout);
  }
  return parsed;
}

const validated = runXstate(["validate", machinePath]);
const reached = runXstate([
  "test",
  machinePath,
  path.join(formalDir, "flow.reach.checks.json"),
]);
const flowGraph = checkFlowGraph();
if (!flowGraph.ok) {
  console.error(JSON.stringify(flowGraph, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      xstate: xstateVersion,
      validate: validated.command,
      checks: [reached.command],
      flowGraph,
      bounds: flowGraphBounds,
      scope: [
        "Representative events in flow.reach.checks.json reach every flow state node.",
        "That CLI check is coverage of the supplied events, not a proof that an unlisted event is impossible.",
        "checkFlowGraph requires every stage, motion, and mode combination, and no non-final deadlock.",
        "A stale Start does not change the flow and does not append a log line.",
        "The event log starts empty. A line is written only when the machine takes the event.",
        "After the stored log wraps, the next transition still follows the stored stage, motion, and mode.",
      ],
    },
    null,
    2,
  ),
);
