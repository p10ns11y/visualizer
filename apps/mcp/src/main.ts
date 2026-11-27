import { writeSync } from "node:fs";
import { readMcpEnv, startMcpServer } from "./server.js";

const options = readMcpEnv();
const running = await startMcpServer(options);
const writes = options.writeToken ? "token" : options.allowWrites ? "flag" : "off";
writeSync(1, `visualizer mcp ${running.url} writes=${writes} state=${options.statePath}\n`);
