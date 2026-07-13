/**
 * Locate the framework assets `crucible init` installs into consumer repos:
 * the oracle-driven schema and the project scaffold.
 *
 * Two layouts are supported:
 *  - published package: assets copied under <pkg>/assets/ at pack time
 *  - monorepo dev:      <repo>/schemas and <repo>/templates, two levels up
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface AssetRoots {
  schemaDir: string; // …/schemas/oracle-driven
  scaffoldDir: string; // …/templates/project-scaffold
}

export function resolveAssets(): AssetRoots | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // here = <pkg>/dist/lib or <pkg>/src/lib -> package root is two levels up.
  const pkgRoot = join(here, "..", "..");
  const candidates = [
    { schemaDir: join(pkgRoot, "assets", "schemas", "oracle-driven"), scaffoldDir: join(pkgRoot, "assets", "project-scaffold") },
    { schemaDir: join(pkgRoot, "..", "..", "schemas", "oracle-driven"), scaffoldDir: join(pkgRoot, "..", "..", "templates", "project-scaffold") },
  ];
  return candidates.find((c) => existsSync(c.schemaDir) && existsSync(c.scaffoldDir)) ?? null;
}
