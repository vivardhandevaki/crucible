import { useCallback, useEffect, useState } from "react";
import { api, type PrSummary } from "../lib/api";
import { CheckDots, Cmd, DiffView, EmptyState, Toast } from "../components";
import { useListNav } from "../lib/keys";

interface Detail { pr: PrSummary; diff: string | null; body: string; verdict: string | null; }

export function ReviewQueue() {
  const [queue, setQueue] = useState<PrSummary[] | null>(null);
  const [hint, setHint] = useState<string | undefined>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const load = useCallback(() => {
    api.reviewQueue().then((q) => { setQueue(q.queue); setHint(q.hint); }).catch((e) => setToast({ msg: e.message, err: true }));
  }, []);
  useEffect(load, [load]);

  const openPr = useCallback((i: number) => {
    const pr = queue?.[i];
    if (pr) api.review(pr.number).then(setDetail).catch((e) => setToast({ msg: e.message, err: true }));
  }, [queue]);
  const sel = useListNav(queue?.length ?? 0, openPr);

  const decide = async (decision: "approve" | "request-changes") => {
    if (!detail) return;
    try {
      const r = await api.reviewDecision(detail.pr.number, decision, note);
      setToast({ msg: `${decision} · ${r.command}` });
      setDetail(null); setNote(""); load();
    } catch (e) { setToast({ msg: (e as Error).message, err: true }); }
  };

  if (!queue) return <div className="muted">Loading…</div>;
  if (queue.length === 0) return <EmptyState title="Nothing needs you" hint={hint ?? "No risk-routed PRs awaiting review."} cmd="crucible audit --sample 0.1" />;

  return (
    <>
      <h1>Review Queue <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{queue.length} routed to you</span></h1>
      <div className="col-2" style={{ gridTemplateColumns: "260px 1fr" }}>
        <div className="stack">
          {queue.map((pr, i) => (
            <div key={pr.number} className={`card ${i === sel ? "sel" : ""}`} onClick={() => openPr(i)}>
              <div className="id">#{pr.number}</div>
              <div className="title">{pr.title}</div>
              <div className="meta">
                <CheckDots pr={pr} /><span className="spacer" />
                {pr.labels.filter((l) => l.startsWith("risk:")).map((l) => <span key={l} className="badge risk">{l}</span>)}
              </div>
            </div>
          ))}
        </div>

        {detail ? (
          <div className="col-3" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="pane" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12 }}>
              <a href={detail.pr.url} target="_blank" rel="noreferrer">#{detail.pr.number} {detail.pr.title} →</a>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="review note (optional)" style={{ width: 220 }} />
                <button className="btn-primary" onClick={() => decide("approve")}>Approve <Cmd cmd={`gh pr review ${detail.pr.number} --approve`} /></button>
                <button className="btn-danger" onClick={() => decide("request-changes")}>Request changes</button>
              </div>
            </div>
            <div className="pane">
              <h4>Reviewer verdict</h4>
              <div className="body">{detail.verdict ? <pre className="src" style={{ background: "transparent" }}>{detail.verdict}</pre> : <span className="muted">No verdict comment found on this PR.</span>}</div>
            </div>
            <div className="pane">
              <h4>Diff</h4>
              <DiffView diff={detail.diff} />
            </div>
          </div>
        ) : <EmptyState title="Select a PR" hint="Pick a PR to see its diff and reviewer verdict." />}
      </div>
      {toast && <Toast msg={toast.msg} err={toast.err} onClose={() => setToast(null)} />}
    </>
  );
}
