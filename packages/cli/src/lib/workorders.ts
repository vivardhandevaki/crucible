/**
 * Work-order filesystem access for a consumer repo: scan, load, save.
 * Directory convention: workorders/<ID>-<slug>/workorder.yaml
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseWorkorder,
  serializeWorkorder,
  type ValidationResult,
  type Workorder,
} from "../core/workorder.js";

export const WORKORDERS_DIR = "workorders";

export interface LoadedWorkorder {
  dir: string; // absolute path to the work-order directory
  result: ValidationResult;
}

/** Find the directory for a work-order ID (dir name starts with `<ID>-`). */
export function findWorkorderDir(cwd: string, id: string): string | null {
  const root = join(cwd, WORKORDERS_DIR);
  if (!existsSync(root)) return null;
  const match = readdirSync(root, { withFileTypes: true }).find(
    (d) => d.isDirectory() && (d.name === id || d.name.startsWith(`${id}-`)),
  );
  return match ? join(root, match.name) : null;
}

export function loadWorkorder(cwd: string, id: string): LoadedWorkorder | null {
  const dir = findWorkorderDir(cwd, id);
  if (!dir) return null;
  const file = join(dir, "workorder.yaml");
  if (!existsSync(file)) {
    return { dir, result: { ok: false, errors: [`missing workorder.yaml in ${dir}`] } };
  }
  return { dir, result: parseWorkorder(readFileSync(file, "utf8")) };
}

/** Scan all work orders; invalid ones are reported, not skipped. */
export function scanWorkorders(cwd: string): Array<{ dirName: string; result: ValidationResult }> {
  const root = join(cwd, WORKORDERS_DIR);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => {
      const file = join(root, d.name, "workorder.yaml");
      if (!existsSync(file)) {
        return { dirName: d.name, result: { ok: false as const, errors: ["missing workorder.yaml"] } };
      }
      return { dirName: d.name, result: parseWorkorder(readFileSync(file, "utf8")) };
    });
}

export function createWorkorderDir(cwd: string, id: string, slug: string): string {
  const dir = join(cwd, WORKORDERS_DIR, `${id}-${slug}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveWorkorder(dir: string, wo: Workorder): void {
  writeFileSync(join(dir, "workorder.yaml"), serializeWorkorder(wo), "utf8");
}
