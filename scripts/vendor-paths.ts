import path from "node:path";

const vendoredRoot = "repos";

const skippedEntries = new Set([vendoredRoot, "node_modules", "dist", ".git"]);

export function skipWalkEntry(name: string): boolean {
  return skippedEntries.has(name);
}

export function isVendoredPath(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === vendoredRoot || relative.startsWith(`${vendoredRoot}${path.sep}`);
}
