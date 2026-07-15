import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, streamPost } from "../lib/api";
import { Cmd, SpecView, Toast } from "../components";
import { useSetWorkflow } from "../lib/workflow";

export function NewFeature() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [created, setCreated] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  // spec-chat state
  const [turns, setTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);

  useSetWorkflow({
    section: created ? "Draft spec" : "New Feature",
    feature: created ? { id, title } : undefined,
    stage: "DRAFT_SPEC",
  });

  const create = async () => {
    try {
      const r = await api.newWorkorder({ id, title, change: slug });
      if (!r.ok) throw new Error(r.stderr || "crucible new failed");
      setCreated(true);
      setToast({ msg: `Created ${id} · ${r.command}` });
    } catch (e) { setToast({ msg: (e as Error).message, err: true }); }
  };

  const send = async () => {
    if (!input.trim() || streaming) return;
    const nextTurns = [...turns, { role: "user" as const, content: input }];
    setTurns(nextTurns);
    setInput("");
    setStreaming(true);
    let acc = "";
    await streamPost("/api/spec-chat", { turns: nextTurns }, {
      chunk: (t) => { acc += t; setDraft(acc); },
      error: (m) => setToast({ msg: m, err: true }),
    });
    setTurns([...nextTurns, { role: "assistant", content: acc }]);
    setStreaming(false);
  };

  const hasShall = /\b(SHALL|MUST)\b/.test(draft);
  const approve = async () => {
    try {
      const r = await api.approveSpec(slug, draft);
      setToast({ msg: `Spec PR #${r.number} opened` });
      window.open(r.url, "_blank");
    } catch (e) { setToast({ msg: (e as Error).message, err: true }); }
  };

  if (!created) {
    return (
      <>
        <div className="pagehead"><h1>New Feature <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· step 1 of 2 — register the work order</span></h1></div>
        <div className="card-form anim-in" style={{ maxWidth: 520 }}>
          <div className="field"><label>Work-Order ID</label><input value={id} onChange={(e) => setId(e.target.value)} placeholder="OMS-1" /></div>
          <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Order cancellation" /></div>
          <div className="field"><label>Change slug</label><input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="cancellation" /></div>
          <button className="btn-primary" disabled={!id || !title || !slug} onClick={create}>
            Create work order <Cmd cmd={`crucible new ${id || "<ID>"} --title "${title || "<t>"}" --change ${slug || "<slug>"}`} />
          </button>
        </div>
        {toast && <Toast msg={toast.msg} err={toast.err} onClose={() => setToast(null)} />}
      </>
    );
  }

  return (
    <>
      <div className="pagehead">
        <h1>{id} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· draft spec — step 2 of 2</span></h1>
        <button onClick={() => navigate(`/wo/${id}/run`)}>Go to Run Monitor →</button>
      </div>
      <div className="col-2" style={{ height: "72vh" }}>
        <div className="pane" style={{ display: "flex", flexDirection: "column" }}>
          <h4>Spec chat {streaming && <span className="livedot" />}</h4>
          <div className="body" style={{ flex: 1, overflow: "auto" }}>
            {turns.length === 0 && <p className="muted">Describe the feature. The assistant drafts a spec delta with SHALL/MUST requirements.</p>}
            {turns.map((t, i) => (
              <div key={i} className={`bubble ${t.role}`}>
                <div className="who">{t.role === "user" ? "you" : "draft"}</div>
                <div className="what">{t.role === "user" ? t.content : "spec updated →"}</div>
              </div>
            ))}
            {streaming && <div className="muted"><span className="spin" /> drafting…</div>}
          </div>
          <div className="composer">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Users can cancel an order within 30 minutes" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
            <button className="btn-primary" disabled={streaming || !input.trim()} onClick={send}>Send</button>
          </div>
        </div>
        <div className="pane" style={{ display: "flex", flexDirection: "column" }}>
          <h4>Spec delta <span className="spacer" />{hasShall ? <span className="pill ok">has SHALL</span> : <span className="pill no">no SHALL yet</span>}</h4>
          <div className="body" style={{ flex: 1, overflow: "auto" }}>
            {draft ? <SpecView text={draft} /> : <p className="muted">The drafted spec appears here.</p>}
          </div>
          <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
            <button className="btn-primary" disabled={!hasShall} onClick={approve}>
              Approve Spec → PR <Cmd cmd={`git checkout -b spec/${slug} && gh pr create`} />
            </button>
          </div>
        </div>
      </div>
      {toast && <Toast msg={toast.msg} err={toast.err} onClose={() => setToast(null)} />}
    </>
  );
}
