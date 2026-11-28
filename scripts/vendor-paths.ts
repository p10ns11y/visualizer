import path from "node:path";

const vendoredRoot = "repos";

const skippedEntries = new Set([vendoredRoot, "node_modules", "dist", ".git"]);

export function skipWalkEntry(name: string): boolean {
  return skippedEntries.has(name);
}

const houseSources = path.join("packages", "sources");

export function isVendoredPath(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  if (relative === vendoredRoot || relative.startsWith(`${vendoredRoot}${path.sep}`)) {
    return true;
  }
  return relative === houseSources || relative.startsWith(`${houseSources}${path.sep}`);
}
