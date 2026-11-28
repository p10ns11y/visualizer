import { realpathSync } from "node:fs";
import path from "node:path";

const libraryRoot = "repos";

const skippedEntries = new Set([libraryRoot, "node_modules", "dist", ".git"]);

export function skipWalkEntry(name: string): boolean {
  return skippedEntries.has(name);
}

function isLibraryRelative(relative: string): boolean {
  return relative === libraryRoot || relative.startsWith(`${libraryRoot}${path.sep}`);
}

function leavesRepo(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === ".." || relative.startsWith(`..${path.sep}`);
}

export function isVendoredPath(root: string, file: string): boolean {
  const base = path.resolve(root);
  const logical = path.resolve(file);
  if (isLibraryRelative(path.relative(base, logical))) return true;
  try {
    const real = realpathSync(logical);
    const relative = path.relative(base, real);
    return isLibraryRelative(relative) || leavesRepo(base, real);
  } catch {
    return false;
  }
}
