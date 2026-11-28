import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { isLibraryCheckoutPath, skipWalkEntry } from "./vendor-paths.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const browser = dom.window;
const globals = globalThis as typeof globalThis & {
  window: typeof browser;
  document: Document;
};
globals.window = browser;
globals.document = browser.document;

const mermaid = (await import("mermaid")).default;

function markdownFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skipWalkEntry(entry)) continue;
    const full = path.join(dir, entry);
    if (isLibraryCheckoutPath(root, full)) continue;
    if (statSync(full).isDirectory()) {
      found.push(...markdownFiles(full));
    } else if (entry.endsWith(".md")) {
      found.push(full);
    }
  }
  return found;
}

const files = [path.join(root, "README.md"), ...markdownFiles(path.join(root, "docs"))];
const fence = /```mermaid[^\n]*\n([\s\S]*?)```/g;

type Failure = { file: string; line: number; message: string };
const failures: Failure[] = [];
let diagrams = 0;

for (const file of files) {
  if (isLibraryCheckoutPath(root, file)) {
    throw new Error("Mermaid scan included a library checkout");
  }
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(fence)) {
    diagrams += 1;
    const body = match[1] ?? "";
    const start = match.index ?? 0;
    const line = text.slice(0, start).split("\n").length + 1;
    try {
      await mermaid.parse(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ file: path.relative(root, file), line, message });
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`${failure.file}:${failure.line}\n${failure.message}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, diagrams })}\n`);
}
