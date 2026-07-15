import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type BoardCard } from "../lib/api";
import { CheckDots, Cmd, EmptyState } from "../components";
import { useListNav } from "../lib/keys";
import { useSetWorkflow } from "../lib/workflow";

const COLUMNS = [
  "DRAFT_SPEC", "SPEC_APPROVED", "ORACLES_AUTHORED", "ORACLES_APPROVED",
  "PACKAGED", "IMPLEMENTING", "PR_OPEN", "GATES_GREEN", "AI_REVIEWED",
  "ROUTED_AUTO", "ROUTED_HUMAN", "MERGED", "CANARY", "DONE", "ESCALATED",
];

export function Board() {
  useSetWorkflow({ section: "Board" });
  const navigate = useNavigate();
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.board().then((b) => { setCards(b.workorders); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const open = useCallback((c: BoardCard) => {
    navigate(["ORACLES_AUTHORED", "ORACLES_APPROVED"].includes(c.state) ? `/wo/${c.id}/oracles` : `/wo/${c.id}/run`);
  }, [navigate]);

  const flat = useMemo(() => cards ?? [], [cards]);
  const sel = useListNav(flat.length, (i) => { if (flat[i]) open(flat[i]); });

  if (err) return <EmptyState title="Could not read the board" hint={err} cmd="crucible status" />;
  if (!cards) return <div className="muted">Loading…</div>;
  if (cards.length === 0) return <EmptyState title="No work orders yet" hint="Create your first feature." cmd="crucible new <ID> --title <t> --change <slug>" />;

  const byState = (s: string) => cards.filter((c) => c.state === s);
  const activeCols = COLUMNS.filter((s) => byState(s).length > 0);

  return (
    <>
      <div className="pagehead">
        <h1>Board <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {cards.length} work orders</span></h1>
        <button onClick={load}>Refresh <Cmd cmd="crucible status" /></button>
      </div>
      <div className="board">
        {activeCols.map((state) => (
          <div className="col" key={state}>
            <div className="col-head">
              <span className="phasetag" />
              <h3>{state.replace(/_/g, " ")}</h3>
              <span className="count">{byState(state).length}</span>
            </div>
            <div className="stagger">
              {byState(state).map((c) => {
                const idx = flat.indexOf(c);
                return (
                  <div key={c.id} className={`card ${idx === sel ? "sel" : ""}`} onClick={() => open(c)}>
                    <div className="id">{c.id}</div>
                    <div className="title">{c.title}</div>
                    <div className="meta">
                      <CheckDots pr={c.pr} />
                      <span className="spacer" />
                      {c.escalated && <span className="badge esc">escalated</span>}
                      <span className="badge">{c.ageDays}d</span>
                    </div>
                    {c.pr && <div style={{ marginTop: 6 }}><a href={c.pr.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>#{c.pr.number}{c.pr.merged ? " merged" : ""}</a></div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="hint">
        <kbd>g</kbd> <kbd>b</kbd> board · <kbd>g</kbd> <kbd>q</kbd> queue · <kbd>j</kbd>/<kbd>k</kbd> select · <kbd>enter</kbd> open
      </p>
    </>
  );
}
