import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi, formsApi } from "../api/forms";
import { FileText, Send, TrendingUp, Users, Plus, ExternalLink } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<any>(null);
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([analyticsApi.dashboard(), formsApi.list({ per_page: 6 })])
      .then(([dashRes, formsRes]) => {
        setDashboard(dashRes.data);
        setForms(formsRes.data.forms);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  const stats = [
    { label: "Total Forms", value: dashboard?.total_forms ?? 0, icon: FileText, color: "#1a73e8" },
    { label: "Published", value: dashboard?.published_forms ?? 0, icon: Send, color: "#34a853" },
    { label: "Total Responses", value: dashboard?.total_responses ?? 0, icon: TrendingUp, color: "#fbbc04" },
    { label: "This Week", value: dashboard?.responses_this_week ?? 0, icon: Users, color: "#ea4335" },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <button className="btn-primary" onClick={() => navigate("/forms/new")}>
          <Plus size={16} /> New Form
        </button>
      </div>

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

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3>Recent Forms</h3>
            <button className="btn-link" onClick={() => navigate("/forms")}>View all</button>
          </div>
          <div className="forms-list">
            {forms.length === 0 && (
              <div className="empty-state">
                <FileText size={40} />
                <p>No forms yet. Create your first form!</p>
                <button className="btn-primary" onClick={() => navigate("/forms/new")}>
                  <Plus size={14} /> Create Form
                </button>
              </div>
            )}
            {forms.map((form) => (
              <div key={form.id} className="form-item" onClick={() => navigate(`/forms/${form.id}/edit`)}>
                <div className="form-item-info">
                  <div className="form-item-title">{form.title}</div>
                  <div className="form-item-meta">
                    <span className={`status-badge ${form.status}`}>{form.status}</span>
                    <span>{form.response_count} responses</span>
                  </div>
                </div>
                <button
                  className="btn-icon"
                  onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/responses`); }}
                  title="View responses"
                >
                  <ExternalLink size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Top Forms by Responses</h3></div>
          {dashboard?.top_forms?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dashboard.top_forms}>
                <XAxis dataKey="title" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="response_count" fill="#1a73e8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">No data yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
