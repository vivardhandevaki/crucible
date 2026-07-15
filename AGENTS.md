# AGENTS.md — Crucible framework repo

Guidance for AI agents working in **this** repository (the Crucible framework itself —
the CLI, Console, reusable workflows, and scaffold). This is distinct from the consumer
CLAUDE.md at `templates/project-scaffold/CLAUDE.md`, which is emitted into governed
projects by `crucible init`.

## Deferred work lives in BACKLOG.md — surface it periodically

Non-blocking, deferred work is tracked in [BACKLOG.md](BACKLOG.md). Keep it in view:

- **When to remind:** at the start of a work session, when a task wraps up, and whenever
  the code you're touching overlaps a backlog entry (each entry names the relevant files).
- **How to remind:** keep it to a short nudge — one line per relevant item, or a bare
  "N open backlog items (see BACKLOG.md)" pointer when nothing overlaps the current work.
  Don't dump the whole file.
- **Relevance first:** prefer items that touch what's being worked on right now over a
  full recital.
- **Don't act unprompted:** never start working a backlog item unless the user asks. When
  one *is* picked up (or becomes obsolete), update or remove its entry so the list stays
  honest — newest items at the top of each section.
