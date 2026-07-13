/**
 * Oracle-map (oracles.md) parsing — shared by `crucible validate`,
 * `crucible package`, the traceability gate, and later the Console.
 * Format defined by schemas/oracle-driven/templates/oracles.md.
 */

export interface OracleRow {
  reqId: string;
  reqText: string;
  ids: string[];
  type: string;
  implPath: string;
  status: string; // DRAFT | IMPLEMENTED | APPROVED
}

/** Parse the traceability table; header/separator and non-oracle rows are ignored. */
export function parseOracleRows(md: string): OracleRow[] {
  return md
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((cols) => cols.length >= 7 && /ORA-/.test(cols[3] ?? ""))
    .map((cols) => ({
      reqId: cols[1] ?? "",
      reqText: cols[2] ?? "",
      ids: (cols[3] ?? "").split(/[,\s]+/).filter((s) => s.startsWith("ORA-")),
      type: cols[4] ?? "",
      implPath: cols[5] ?? "",
      status: (cols[6] ?? "").toUpperCase(),
    }));
}

export interface Requirement {
  name: string; // "### Requirement: <name>"
  file: string;
  text: string; // full block text
  normative: boolean; // contains SHALL or MUST
}

/** Extract requirement blocks from an OpenSpec spec-delta markdown file. */
export function parseRequirements(file: string, md: string): Requirement[] {
  const out: Requirement[] = [];
  const parts = md.split(/^### Requirement:\s*/m).slice(1);
  for (const part of parts) {
    const name = (part.split("\n")[0] ?? "").trim();
    const text = part.split(/^##[^#]/m)[0] ?? part; // stop at the next ## section
    out.push({ name, file, text, normative: /\b(SHALL|MUST)\b/.test(text) });
  }
  return out;
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Is a requirement covered by an oracle row? A row covers a requirement when
 * its verbatim requirement text appears in the block (or names it), or its
 * REQ ID appears in the block text.
 */
export function rowCovers(row: OracleRow, req: Requirement): boolean {
  const rowText = normalize(row.reqText);
  const blockText = normalize(req.text);
  const name = normalize(req.name);
  return (
    (rowText.length > 8 && blockText.includes(rowText)) ||
    (name.length > 0 && rowText.includes(name)) ||
    (row.reqId.length > 4 && req.text.includes(row.reqId))
  );
}
