import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi, formsApi } from "../api/forms";
import { FileText, Send, TrendingUp, Users, ExternalLink } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell
} from "recharts";

const COLORS = ["#1a73e8", "#34a853", "#fbbc04", "#ea4335", "#9c27b0"];

export default function OrgAnalytics() {
  const navigate  = useNavigate();
  const [dash,    setDash]    = useState<any>(null);
  const [forms,   setForms]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([analyticsApi.dashboard(), formsApi.list({ per_page: 20 })])
      .then(([dashRes, formsRes]) => {
        setDash(dashRes.data);
        setForms(formsRes.data.forms);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading analytics…</div>;

  const stats = [
    { label: "Total Forms",        value: dash?.total_forms       ?? 0, icon: FileText,   color: "#1a73e8" },
    { label: "Published Forms",    value: dash?.published_forms   ?? 0, icon: Send,        color: "#34a853" },
    { label: "Total Responses",    value: dash?.total_responses   ?? 0, icon: TrendingUp,  color: "#fbbc04" },
    { label: "Responses This Week",value: dash?.responses_this_week ?? 0, icon: Users,     color: "#ea4335" },
  ];

  // Build response rate data for each form
  const formRateData = forms
    .filter((f) => f.response_count > 0)
    .sort((a, b) => b.response_count - a.response_count)
    .slice(0, 10)
    .map((f) => ({ name: f.title.length > 22 ? f.title.slice(0, 22) + "…" : f.title, responses: f.response_count, id: f.id }));

  // Status breakdown
  const statusData = [
    { name: "Published", count: forms.filter(f => f.status === "published").length },
    { name: "Draft",     count: forms.filter(f => f.status === "draft").length },
    { name: "Closed",    count: forms.filter(f => f.status === "closed").length },
  ].filter(d => d.count > 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Organisation Analytics</h1>
          <p style={{ color: "#5f6368", fontSize: 13, marginTop: 4 }}>
            Aggregate view across all forms in your organisation
          </p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-icon" style={{ background: s.color + "1a", color: s.color }}>
              <s.icon size={22} />
            </div>
            <div className="stat-info">
              <div className="stat-value">{s.value.toLocaleString()}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="analytics-grid" style={{ marginBottom: 20 }}>

        {/* Top forms by responses */}
        <div className="card span-2">
          <div className="card-header">
            <h3>Top Forms by Responses</h3>
          </div>
          {formRateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={formRateData} layout="vertical"
                margin={{ left: 10, right: 20, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={160} />
                <Tooltip
                  formatter={(value: any) => [value, "Responses"]}
                  cursor={{ fill: "#f1f3f4" }}
                />
                <Bar dataKey="responses" radius={[0, 6, 6, 0]}>
                  {formRateData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">No responses yet — publish a form and share it.</div>
          )}
        </div>

        {/* Form status breakdown */}
        <div className="card">
          <div className="card-header"><h3>Forms by Status</h3></div>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData}>
                <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {statusData.map((d, i) => (
                    <Cell key={i}
                      fill={d.name === "Published" ? "#34a853" : d.name === "Draft" ? "#9aa0a6" : "#ea4335"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">No forms yet.</div>
          )}
        </div>

        {/* Top 5 table */}
        <div className="card">
          <div className="card-header"><h3>Top 5 Most Active Forms</h3></div>
          {dash?.top_forms?.length > 0 ? (
            <div style={{ overflow: "hidden" }}>
              {dash.top_forms.map((f: any, i: number) => (
                <div key={f.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 0", borderBottom: i < 4 ? "1px solid #e8eaed" : "none"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: COLORS[i % COLORS.length] + "22",
                      color: COLORS[i % COLORS.length],
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, flexShrink: 0
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: "#5f6368" }}>
                      {f.response_count} responses
                    </span>
                    <button className="btn-icon" style={{ padding: 5 }}
                      onClick={() => navigate(`/forms/${f.id}/analytics`)}
                      title="View form analytics">
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-chart">No data yet.</div>
          )}
        </div>
      </div>

      {/* ── All forms table ── */}
      <div className="card">
        <div className="card-header">
          <h3>All Forms</h3>
          <span style={{ fontSize: 13, color: "#5f6368" }}>{forms.length} total</span>
        </div>
        <div className="table-wrapper" style={{ border: "none" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Form Title</th>
                <th>Status</th>
                <th>Responses</th>
                <th>Owner</th>
                <th>Last Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {forms.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "#5f6368", padding: 32 }}>
                  No forms yet.
                </td></tr>
              )}
              {forms.map((f) => (
                <tr key={f.id}>
                  <td>
                    <span className="form-title-cell"
                      onClick={() => navigate(`/forms/${f.id}/edit`)}>
                      {f.title}
                      {f.is_quiz && <span className="badge quiz-badge" style={{ marginLeft: 8 }}>Quiz</span>}
                    </span>
                  </td>
                  <td><span className={`status-badge ${f.status}`}>{f.status}</span></td>
                  <td><strong>{f.response_count}</strong></td>
                  <td style={{ color: "#5f6368", fontSize: 13 }}>{f.owner?.name}</td>
                  <td style={{ color: "#5f6368", fontSize: 13 }}>
                    {new Date(f.updated_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => navigate(`/forms/${f.id}/analytics`)}
                      title="View analytics" style={{ padding: 5 }}>
                      <ExternalLink size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
