import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { analyticsApi, formsApi } from "../api/forms";
import { ArrowLeft } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const COLORS = ["#1a73e8", "#34a853", "#fbbc04", "#ea4335", "#9c27b0", "#ff9800"];

export default function Analytics() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([formsApi.get(Number(id)), analyticsApi.form(Number(id))])
      .then(([formRes, analyticsRes]) => {
        setForm(formRes.data.form);
        setData(analyticsRes.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-loading">Loading analytics...</div>;

  const overview = data?.overview;
  const trend = data?.trend || [];
  const breakdown = data?.question_breakdown || [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-icon" onClick={() => navigate("/forms")}>
            <ArrowLeft size={18} />
          </button>
          <h1>{form?.title} — Analytics</h1>
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: "Total Responses", value: overview?.total_responses },
          { label: "Completion Rate", value: `${overview?.completion_rate}%` },
          { label: "Today", value: overview?.today },
          { label: "This Week", value: overview?.this_week },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-value">{s.value ?? "—"}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <div className="card span-2">
          <div className="card-header"><h3>Responses Over Time (30 days)</h3></div>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#1a73e8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="empty-chart">No data for this period</div>}
        </div>

        {breakdown.filter((q: any) => q.choices?.length > 0).map((q: any) => (
          <div key={q.name} className="card">
            <div className="card-header"><h3>{q.question}</h3></div>
            {q.type === "radiogroup" || q.type === "dropdown" ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={q.choices} dataKey="count" nameKey="value" cx="50%" cy="50%" outerRadius={70} label>
                    {q.choices.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={q.choices} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="value" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1a73e8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}

        {data?.quiz && (
          <div className="card">
            <div className="card-header"><h3>Quiz Score Distribution</h3></div>
            <div className="quiz-stats">
              <div>Average Score: <strong>{data.quiz.avg_score?.toFixed(1)}</strong></div>
              <div>Max Possible: <strong>{data.quiz.max_possible}</strong></div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.quiz.score_distribution}>
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#34a853" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
