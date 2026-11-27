import { runModelBasedPaths } from "../packages/core/src/mbt/run.ts";

const report = await runModelBasedPaths();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
