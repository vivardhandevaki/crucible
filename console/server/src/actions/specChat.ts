/**
 * Spec-drafting chat — shells out to the `claude` CLI under the owner's Claude
 * subscription (CLAUDE_CODE_OAUTH_TOKEN), NOT the pay-as-you-go API (ADR 0003 /
 * v0.2.0 subscription-auth). Streams tokens to the client over SSE.
 */

import { spawn } from "node:child_process";
import type { Config } from "../config.js";

const DRAFTING_PROMPT = `You are helping a human author an OpenSpec spec delta for a new feature in a
Crucible-governed repository. Produce spec text in this exact shape:

## ADDED Requirements

### Requirement: <short name>
The system SHALL <precise, testable behaviour>.

#### Scenario: <name>
- **WHEN** <trigger>
- **THEN** <observable outcome>

Rules:
- Every requirement MUST use a normative SHALL or MUST and be machine-verifiable.
- Prefer several small, sharp requirements over one vague one.
- No implementation detail — describe observable behaviour only.
- Output ONLY the markdown spec delta (no preamble, no code fences).`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Serialize the conversation into a single prompt for headless `claude -p`. */
function buildPrompt(turns: ChatTurn[]): string {
  const convo = turns.map((t) => `${t.role === "user" ? "HUMAN" : "DRAFT"}: ${t.content}`).join("\n\n");
  return `${DRAFTING_PROMPT}\n\n---\nConversation so far:\n${convo}\n\nProduce the updated spec delta now.`;
}

export function streamSpecChat(
  cfg: Config,
  turns: ChatTurn[],
  onChunk: (text: string) => void,
  onDone: (err?: string) => void,
): () => void {
  if (cfg.claudeMode === "off") {
    onDone("No Claude available — log in with the `claude` CLI, or set CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`).");
    return () => {};
  }
  // Prefer an explicit token; otherwise inherit the host `claude` login.
  const env = cfg.claudeToken ? { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: cfg.claudeToken } : { ...process.env };
  const child = spawn("claude", ["-p", buildPrompt(turns), "--output-format", "text"], {
    cwd: cfg.repoPath,
    env,
  });
  child.stdout.on("data", (d) => onChunk(String(d)));
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  child.on("close", (code) => onDone(code === 0 ? undefined : stderr.trim() || `claude exited ${code}`));
  child.on("error", (err) => onDone(String(err)));
  return () => child.kill();
}
