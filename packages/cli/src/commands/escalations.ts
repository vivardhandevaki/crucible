/**
 * crucible escalations — list open escalations with their structured content.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CmdContext, CmdResult } from "../lib/context.js";
import { findWorkorderDir, scanWorkorders } from "../lib/workorders.js";

export async function cmdEscalations(ctx: CmdContext): Promise<CmdResult> {
  const open: Array<{ id: string; file: string; created_at: string; content: string }> = [];
  for (const { result } of scanWorkorders(ctx.cwd)) {
    if (!result.ok || !result.workorder.escalation) continue;
    const wo = result.workorder;
    const dir = findWorkorderDir(ctx.cwd, wo.id);
    const file = dir ? join(dir, wo.escalation!.file) : "";
    open.push({
      id: wo.id,
      file: wo.escalation!.file,
      created_at: wo.escalation!.created_at,
      content: file && existsSync(file) ? readFileSync(file, "utf8") : "(escalation file missing)",
    });
  }
  return {
    exitCode: 0,
    data: { escalations: open.map(({ content: _c, ...rest }) => rest), count: open.length },
    lines:
      open.length === 0
        ? ["no open escalations"]
        : open.flatMap((e) => [`── ${e.id} (${e.created_at}) ${"─".repeat(30)}`, e.content.trim(), ""]),
  };
}
