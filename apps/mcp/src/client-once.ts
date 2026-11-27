import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.argv[2];
const tool = process.argv[3];
const raw = process.argv[4] ?? "{}";
if (!url || !tool) {
  console.error("usage: client-once <url> <tool> <json>");
  process.exit(2);
}
const args = JSON.parse(raw) as Record<string, unknown>;
const headers: Record<string, string> = { Origin: new URL(url).origin };
const token = process.env.VISUALIZER_MCP_WRITE_TOKEN;
if (token) headers.Authorization = `Bearer ${token}`;

const client = new Client({ name: "visualizer-external", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
await client.connect(transport);
const result = await client.callTool({ name: tool, arguments: args });
console.log(JSON.stringify(result));
await client.close();
