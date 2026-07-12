# schemas — OpenSpec workflow schemas shipped by Crucible

## `oracle-driven`

A fork of OpenSpec's built-in `spec-driven` schema that inserts **`oracles`** as a
first-class artifact between `specs` and `tasks`:

```
proposal → specs → design → oracles → tasks
```

- `oracles` **requires `specs`** (oracles judge *requirements*, not designs).
- `tasks` **requires `specs, design, oracles`** — so **no implementation planning
  begins until the oracle map exists.** This mechanically enforces Crucible's rule
  *"a requirement without an oracle is a wish."*

The `oracles` artifact's `instruction` block encodes the oracle-authoring policy
(traceability table, the oracle-type taxonomy, the coverage rule, the
`ORA-<CHANGE>-<n><letter>` id format, and the `/oracles` approval lifecycle). The
`templates/oracles.md` file is the traceability table the agent fills in and the
`traceability` gate (Phase 3) parses.

### How it reaches a consumer repo

`crucible init` (Phase 2) runs `openspec init` in the consumer, copies this
directory to the consumer's `openspec/schemas/oracle-driven/`, and sets
`openspec/config.yaml` → `schema: oracle-driven` so every `/opsx:new` uses it.

### Verified against OpenSpec 1.6.0

```
openspec schema validate oracle-driven      # ✓ valid
openspec templates --schema oracle-driven   # resolves oracles → templates/oracles.md
openspec status --change <c>                 # tasks shows "blocked by: oracles"
                                             #   until oracles.md exists
```

Pinned OpenSpec version: see `toolchain/versions.lock.md`. Treat `openspec update`
as a reviewed harness change (schema/template behavior shifting mid-project is a
repeatability leak).
