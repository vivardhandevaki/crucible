import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type Traceability, type TraceRow } from "../lib/api";
import { Cmd, EmptyState, Toast } from "../components";

export function OracleReview() {
  const { id = "" } = useParams();
  const [slug, setSlug] = useState<string | null>(null);
  const [trace, setTrace] = useState<Traceability | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<TraceRow | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  useEffect(() => {
    api.workorder(id).then((wo) => {
      const s = wo.change.replace(/\/+$/, "").split("/").pop() ?? "";
      setSlug(s);
      return api.traceability(s);
    }).then(setTrace).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <EmptyState title="No oracle map" hint={err} cmd={`crucible validate ${id}`} />;
  if (!trace || !slug) return <div className="muted">Loading…</div>;

  const approve = async () => {
    try {
      const r = await api.approveOracles(slug);
      setToast({ msg: `Oracle PR #${r.number} opened` });
      window.open(r.url, "_blank");
    } catch (e) { setToast({ msg: (e as Error).message, err: true }); }
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>{id} · Oracle Review <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{slug}</span></h1>
        <button className="btn-primary" disabled={trace.unmapped.length > 0} onClick={approve}>
          Approve Oracles → PR <Cmd cmd={`git checkout -b oracles/${slug} && gh pr create`} />
        </button>
      </div>

      {trace.unmapped.length > 0 && (
        <div className="toast err" style={{ position: "static", marginBottom: 16, maxWidth: "none" }}>
          {trace.unmapped.length} requirement(s) without an oracle: {trace.unmapped.join(", ")}. Approval is blocked until every SHALL/MUST maps.
        </div>
      )}

      <table className="tbl">
        <thead><tr><th>REQ</th><th>Requirement</th><th>Oracle IDs</th><th>Type</th><th>Impl</th><th>Status</th></tr></thead>
        <tbody>
          {trace.requirements.map((req) => (
            <tr key={req.name} className={req.covered ? "" : "unmapped"}>
              <td className="mono">—</td>
              <td>{req.name}</td>
              <td colSpan={3} className="muted">{req.covered ? "" : "no covering oracle row"}</td>
              <td>{req.covered ? <span className="pill ok">mapped</span> : <span className="pill no">unmapped</span>}</td>
            </tr>
          ))}
          {trace.rows.map((row) => (
            <tr key={row.ids.join(",")} className="clickable" onClick={() => setOpenRow(row)}>
              <td className="mono">{row.reqId}</td>
              <td>{row.reqText}</td>
              <td className="mono">{row.ids.join(", ")}</td>
              <td>{row.type}</td>
              <td>{row.implExists ? <span className="mono" style={{ fontSize: 11 }}>{row.implPath}</span> : <span className="pill no">missing</span>}</td>
              <td><span className={`pill ${row.status === "APPROVED" ? "ok" : ""}`}>{row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      {openRow && (
        <div className="pane" style={{ marginTop: 16 }}>
          <h4>{openRow.implPath} · {openRow.ids.join(", ")}</h4>
          <pre className="src">{openRow.implSource ?? "(source not found on this branch)"}</pre>
        </div>
      )}
      {toast && <Toast msg={toast.msg} err={toast.err} onClose={() => setToast(null)} />}
    </>
  );
}
