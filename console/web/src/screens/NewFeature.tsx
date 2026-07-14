import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, streamPost } from "../lib/api";
import { Cmd, SpecView, Toast } from "../components";

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
        <h1>New Feature</h1>
        <div style={{ maxWidth: 480 }}>
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
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>{id} · draft spec</h1>
        <button onClick={() => navigate(`/wo/${id}/run`)}>Go to Run Monitor →</button>
      </div>
      <div className="col-2" style={{ height: "72vh" }}>
        <div className="pane" style={{ display: "flex", flexDirection: "column" }}>
          <h4>Spec chat</h4>
          <div className="body" style={{ flex: 1, overflow: "auto" }}>
            {turns.length === 0 && <p className="muted">Describe the feature. The assistant drafts a spec delta with SHALL/MUST requirements.</p>}
            {turns.map((t, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div className="muted" style={{ fontSize: 11 }}>{t.role === "user" ? "you" : "draft"}</div>
                <div>{t.role === "user" ? t.content : <span className="muted">(spec updated →)</span>}</div>
              </div>
            ))}
            {streaming && <div className="muted">drafting…</div>}
          </div>
          <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Users can cancel an order within 30 minutes" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
            <button className="btn-primary" disabled={streaming || !input.trim()} onClick={send}>Send</button>
          </div>
        </div>
        <div className="pane" style={{ display: "flex", flexDirection: "column" }}>
          <h4>Spec delta {hasShall ? <span className="pill ok">has SHALL</span> : <span className="pill no">no SHALL yet</span>}</h4>
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
