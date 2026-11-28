import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pilotMachineJson } from "../packages/core/src/formal/export-machine.ts";
import { checkLockstep, lockstepBounds } from "../packages/core/src/formal/lockstep.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formalDir = path.join(root, "packages/core/src/formal");
const require = createRequire(path.join(root, "packages/core/package.json"));
const xstateRoot = path.dirname(require.resolve("xstate/package.json"));
const xstateBin = path.join(xstateRoot, "bin/xstate.js");
const xstateVersion = (require(path.join(xstateRoot, "package.json")) as { version: string })
  .version;

const directory = mkdtempSync(path.join(tmpdir(), "visualizer-formal-"));
const machinePath = path.join(directory, "pilot.json");
writeFileSync(machinePath, pilotMachineJson());

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
const safe = runXstate([
  "test",
  machinePath,
  path.join(formalDir, "pilot.safe.checks.json"),
]);
const failed = runXstate([
  "test",
  machinePath,
  path.join(formalDir, "pilot.fail.checks.json"),
]);
const lockstep = await checkLockstep();
if (!lockstep.ok) {
  console.error(JSON.stringify(lockstep, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      xstate: xstateVersion,
      validate: validated.command,
      checks: [safe.command, failed.command],
      lockstep,
      bounds: lockstepBounds,
      scope: [
        "Representative events in pilot.safe.checks.json never reach #pilot.failed and do reach the other railway states.",
        "Representative events in pilot.fail.checks.json reach #pilot.failed and never reach #pilot.completed.",
        "Those CLI checks are coverage of the supplied events, not a proof that an unlisted event is impossible.",
        "checkLockstep interleaves finished calls to applyPilotEvent, commitHuman, commitView, pauseRun, resumeRun, and applyBuildTick.",
        "applyBuildTick returns the same workspace when the version matches. It does not await a model.",
        `Search stops after stateVersion ${lockstepBounds.maxVersion} or ${lockstepBounds.maxFingerprints} fingerprints.`,
      ],
    },
    null,
    2,
  ),
);
