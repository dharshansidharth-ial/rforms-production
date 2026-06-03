import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formsApi, responsesApi } from "../api/forms";
import { ArrowLeft, Download, Eye } from "lucide-react";
import toast from "react-hot-toast";

export default function Responses() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      formsApi.get(Number(id)),
      responsesApi.list(Number(id), { page }),
    ]).then(([formRes, respRes]) => {
      setForm(formRes.data.form);
      setResponses(respRes.data.responses);
      setMeta(respRes.data.meta);
    }).finally(() => setLoading(false));
  }, [id, page]);

  const handleExport = async () => {
    try {
      const res = await responsesApi.exportCsv(Number(id));
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `responses_${id}.csv`;
      a.click();
    } catch {
      toast.error("Export failed");
    }
  };

  if (loading) return <div className="page-loading">Loading...</div>;

  const questions = form?.schema?.pages?.flatMap((p: any) => p.elements || []) || [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-icon" onClick={() => navigate("/forms")}>
            <ArrowLeft size={18} />
          </button>
          <h1>{form?.title} — Responses</h1>
          <span className="badge">{meta.total_count ?? responses.length} responses</span>
        </div>
        <div className="page-header-right">
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {responses.length === 0 ? (
        <div className="empty-state centered">No responses yet.</div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Respondent</th>
                <th>Submitted</th>
                <th>Score</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {responses.map((r, i) => (
                <tr key={r.id}>
                  <td>{(page - 1) * 50 + i + 1}</td>
                  <td>{r.responder_email || "Anonymous"}</td>
                  <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}</td>
                  <td>{r.score != null ? `${r.score}/${r.max_score}` : "—"}</td>
                  <td><span className={`status-badge ${r.status}`}>{r.status}</span></td>
                  <td>
                    <button className="btn-icon" onClick={() => setSelected(r)} title="View">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.total_pages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>Page {meta.current_page} of {meta.total_pages}</span>
          <button disabled={page === meta.total_pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content response-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Response #{selected.id}</h3>
              <button onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="response-body">
              {questions.map((q: any) => (
                <div key={q.name} className="response-field">
                  <div className="response-label">{q.title || q.name}</div>
                  <div className="response-value">
                    {Array.isArray(selected.payload[q.name])
                      ? selected.payload[q.name].join(", ")
                      : selected.payload[q.name]?.toString() || <em>—</em>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
