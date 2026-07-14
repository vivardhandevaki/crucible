import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type CliResult, type WorkorderDetail } from "../lib/api";
import { Cmd, EmptyState, Stepper, Toast } from "../components";

export function RunMonitor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [wo, setWo] = useState<WorkorderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [validation, setValidation] = useState<CliResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => { api.workorder(id).then(setWo).catch((e) => setErr(e.message)); }, [id]);
  useEffect(load, [load]);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  const validate = async () => setValidation(await api.validate(id));

  const startRun = async () => {
    const r = await api.run(id);
    if (!r.started) { setToast({ msg: r.error ?? "run failed to start", err: true }); return; }
    setToast({ msg: `Run started (pid ${r.pid}) — survives Console restart` });
    setLog([]); setStreaming(true);
    const es = new EventSource(`/api/workorders/${id}/runlog/stream`);
    es.addEventListener("log", (e) => setLog((l) => [...l, JSON.parse((e as MessageEvent).data).line]));
    es.addEventListener("waiting", () => setLog((l) => (l.length ? l : ["waiting for sandbox…"])));
    es.addEventListener("done", () => { setStreaming(false); es.close(); load(); });
    es.onerror = () => { setStreaming(false); es.close(); };
  };

  if (err) return <EmptyState title="Work order not found" hint={err} cmd="crucible status" />;
  if (!wo) return <div className="muted">Loading…</div>;
  const runnable = ["PACKAGED", "PR_OPEN", "IMPLEMENTING"].includes(wo.state);

  return (
    <>
      <h1>{id} · Run Monitor</h1>
      <div className="pane" style={{ padding: 16, marginBottom: 16 }}><Stepper state={wo.state} /></div>

      {wo.escalated && wo.escalation && (
        <div className="pane" style={{ marginBottom: 16, borderColor: "var(--risk)" }}>
          <h4 style={{ color: "var(--risk)" }}>Escalation — resolution is a spec/oracle fix by the owner</h4>
          <pre className="src">{wo.escalation}</pre>
          <div style={{ padding: 12 }}>
            <button className="btn-primary" onClick={() => navigate("/new")}>Resolve via spec change →</button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <button onClick={validate}>Validate <Cmd cmd={`crucible validate ${id}`} /></button>
        <button className="btn-primary" disabled={!runnable || streaming} onClick={startRun}>
          {streaming ? "Running…" : "Start Implementation"} <Cmd cmd={`crucible run ${id}`} />
        </button>
        <span className="spacer" />
        {wo.pr && <a href={wo.pr.url} target="_blank" rel="noreferrer">PR #{wo.pr.number} →</a>}
      </div>

      {validation && (
        <div className="pane" style={{ marginBottom: 16 }}>
          <h4>{validation.command} → exit {validation.exitCode}</h4>
          <pre className="src">{validation.stdout || validation.stderr || "(no output)"}</pre>
        </div>
      )}

      <div className="pane">
        <h4>Sandbox log {streaming && <span className="muted">· streaming</span>}</h4>
        <div className="log" ref={logRef}>{log.length ? log.join("\n") : "No run yet. Start Implementation to launch the sandbox."}</div>
      </div>
      {toast && <Toast msg={toast.msg} err={toast.err} onClose={() => setToast(null)} />}
    </>
  );
}
