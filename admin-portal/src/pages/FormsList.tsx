import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formsApi } from "../api/forms";
import toast from "react-hot-toast";
import { Plus, Edit2, BarChart2, Trash2, Copy, Send, Eye, Link2 } from "lucide-react";

export default function FormsList() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadForms = async (p = 1) => {
    setLoading(true);
    try {
      const res = await formsApi.list({ page: p, per_page: 10 });
      setForms(res.data.forms);
      setMeta(res.data.meta);
    } catch {
      setForms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadForms(page); }, [page]);

  const handlePublish = async (id: number) => {
    await formsApi.publish(id);
    toast.success("Form published!");
    loadForms(page);
  };

  const handleCopy = async (id: number) => {
    const res = await formsApi.copy(id);
    toast.success("Form copied!");
    navigate(`/forms/${res.data.form.id}/edit`);
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    await formsApi.delete(id);
    toast.success("Form deleted");
    loadForms(page);
  };

  const copyPublicLink = (token: string) => {
    const url = `${process.env.REACT_APP_CUSTOMER_URL || "http://localhost:3002"}/f/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied!");
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Forms</h1>
        <button className="btn-primary" onClick={() => navigate("/forms/new")}>
          <Plus size={16} /> New Form
        </button>
      </div>

      {loading ? (
        <div className="page-loading">Loading...</div>
      ) : forms.length === 0 ? (
        <div className="empty-state centered">
          <div>No forms yet.</div>
          <button className="btn-primary mt-2" onClick={() => navigate("/forms/new")}>
            <Plus size={14} /> Create your first form
          </button>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Responses</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="form-title-cell" onClick={() => navigate(`/forms/${f.id}/edit`)}>
                        {f.title}
                        {f.is_quiz && <span className="badge quiz-badge">Quiz</span>}
                      </div>
                    </td>
                    <td><span className={`status-badge ${f.status}`}>{f.status}</span></td>
                    <td>{f.response_count}</td>
                    <td>{new Date(f.updated_at).toLocaleDateString()}</td>
                    <td>
                      <div className="action-buttons">
                        <button title="Edit" onClick={() => navigate(`/forms/${f.id}/edit`)}><Edit2 size={15} /></button>
                        <button title="Responses" onClick={() => navigate(`/forms/${f.id}/responses`)}><Eye size={15} /></button>
                        <button title="Analytics" onClick={() => navigate(`/forms/${f.id}/analytics`)}><BarChart2 size={15} /></button>
                        {f.status !== "published" && (
                          <button title="Publish" onClick={() => handlePublish(f.id)}><Send size={15} /></button>
                        )}
                        {f.status === "published" && (
                          <button title="Copy link" onClick={() => copyPublicLink(f.public_token)}><Link2 size={15} /></button>
                        )}
                        <button title="Duplicate" onClick={() => handleCopy(f.id)}><Copy size={15} /></button>
                        <button title="Delete" className="danger" onClick={() => handleDelete(f.id, f.title)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta.total_pages > 1 && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>Page {meta.current_page} of {meta.total_pages}</span>
              <button disabled={page === meta.total_pages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
