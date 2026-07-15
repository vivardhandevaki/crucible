# Crucible Console

A local, **stateless** web app — a *view and remote control* over the Crucible
state machine. All authoritative state lives in git + GitHub; the Console reads it
and triggers the same `crucible` CLI / GitHub actions you'd run in a terminal. If it
dies, your workflow is 100% operable from the terminal + GitHub UI (ADR 0003).

## Screens

- **Board** (`/`) — kanban of work orders by state, with the 11-gate check-dot row per PR.
- **New Feature** (`/new`) — create a work order, draft a spec with the `claude` chat, **Approve Spec** → PR.
- **Oracle Review** (`/wo/:id/oracles`) — the REQ→oracle traceability table; **Approve Oracles** → PR.
- **Run Monitor** (`/wo/:id/run`) — state stepper, `crucible validate`, **Start Implementation** (live log), escalation card.
- **Review Queue** (`/queue`) — risk-routed PRs: diff · reviewer verdict · approve / request-changes.

Every action shows its terminal equivalent (the `⌘` popover). Keyboard: `g b` board, `g q` queue, `j`/`k` select, `enter` open.

## Run it

From the framework repo root. **If `gh` and `claude` are already set up on your machine,
you need no `.env`** — the Console reuses your `gh` login (`gh auth token`) and your
logged-in `claude`. Just point it at your project:

```bash
export CRUCIBLE_REPO=/path/to/your-crucible-project   # or run from inside that repo
npm run console:install                                # installs cli + server + web + root
npm run console                                        # server :7317 + Vite :7318 (open http://localhost:7318)
```

Override or supply credentials explicitly via `cp console/.env.example console/.env`
(a GitHub token, a Claude token, a different port). The top bar shows the resolved
sources, e.g. `gh ✓ (gh cli) · claude ✓ (host)`.

Production (single server serving built assets):

```bash
npm run console:build && npm run console:start   # http://localhost:7317
```

Docker (toolchain image, localhost only):

```bash
docker compose -f console/docker-compose.yml up
```

## Architecture

- **Server** (`console/server`, Express, `127.0.0.1:7317`): reads via `simple-git` + Octokit,
  parses artifacts with the shared `@crucible/cli/core`. The **only writers** are the CLI
  shell-out, GitHub API calls, and the approval-PR flow — enforced by the §5.4 guarantee tests.
  Runs are spawned **detached**, so killing the Console never aborts a sandbox run.
- **Web** (`console/web`, React + Vite): an elegant, workflow-first instrument panel —
  the "Indigo Midnight" design system (`src/styles.css`). Dark by default with a light
  theme (toggle in the top bar, persisted to `localStorage`). A persistent workflow bar
  shows *Project › Feature › Stage* with a compact phase rail (Spec → Oracles → Build →
  Review → Ship); screens are grouped into labelled sections and use subtle,
  motion-reduced-aware animation to convey streaming, advancing, and arriving. Retains
  the doctrine's substance: system font, 4px grid, tabular numerals, hairline borders.

## Tests

```bash
npm --prefix console/server test     # read endpoints + the three §5.4 negative guarantees
```

A browser-level UI smoke test (Playwright) is tracked in the backlog.
