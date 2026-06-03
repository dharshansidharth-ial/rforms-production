import React, { useEffect, useState } from "react";
import client from "../api/client";
import toast from "react-hot-toast";
import { Save } from "lucide-react";

export default function Organization() {
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", logo_url: "", primary_color: "#1a73e8",
    accent_color: "#fbbc04", font: "Inter", default_language: "en",
    mfa_required: false, sheets_capture_enabled: false
  });

  useEffect(() => {
    client.get("/organization").then((res) => {
      const o = res.data.organization;
      setOrg(o);
      setForm({
        name: o.name,
        logo_url: o.branding.logo_url || "",
        primary_color: o.branding.primary_color || "#1a73e8",
        accent_color: o.branding.accent_color || "#fbbc04",
        font: o.branding.font || "Inter",
        default_language: o.default_language || "en",
        mfa_required: o.mfa_required,
        sheets_capture_enabled: o.sheets_capture_enabled,
      });
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await client.patch("/organization", { organization: form });
      toast.success("Organization settings saved!");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Organization Settings</h1>
      </div>

      <div className="settings-card">
        <form onSubmit={handleSave}>
          <div className="settings-section">
            <h3>General</h3>
            <div className="form-group">
              <label>Organization Name</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
          </div>

          <div className="settings-section">
            <h3>Branding</h3>
            <div className="form-group">
              <label>Logo URL</label>
              <input type="url" placeholder="https://..." value={form.logo_url}
                onChange={(e) => setForm(f => ({ ...f, logo_url: e.target.value }))} />
              {form.logo_url && <img src={form.logo_url} alt="logo preview" className="logo-preview" />}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Primary Color</label>
                <div className="color-input">
                  <input type="color" value={form.primary_color}
                    onChange={(e) => setForm(f => ({ ...f, primary_color: e.target.value }))} />
                  <input type="text" value={form.primary_color}
                    onChange={(e) => setForm(f => ({ ...f, primary_color: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Accent Color</label>
                <div className="color-input">
                  <input type="color" value={form.accent_color}
                    onChange={(e) => setForm(f => ({ ...f, accent_color: e.target.value }))} />
                  <input type="text" value={form.accent_color}
                    onChange={(e) => setForm(f => ({ ...f, accent_color: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>Font</label>
              <select value={form.font} onChange={(e) => setForm(f => ({ ...f, font: e.target.value }))}>
                {["Inter", "Roboto", "Open Sans", "Lato", "Poppins"].map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="settings-section">
            <h3>Security & Policies</h3>
            <label className="toggle-row">
              <span>Require MFA for all users</span>
              <input type="checkbox" checked={form.mfa_required}
                onChange={(e) => setForm(f => ({ ...f, mfa_required: e.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Enable Spreadsheet Capture (Rediff Sheets)</span>
              <input type="checkbox" checked={form.sheets_capture_enabled}
                onChange={(e) => setForm(f => ({ ...f, sheets_capture_enabled: e.target.checked }))} />
            </label>
          </div>

          <div className="settings-section">
            <h3>Localization</h3>
            <div className="form-group">
              <label>Default Language</label>
              <select value={form.default_language}
                onChange={(e) => setForm(f => ({ ...f, default_language: e.target.value }))}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={15} /> {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>

        <div className="org-stats">
          <div><strong>Domain:</strong> {org?.domain}</div>
          <div><strong>Total Users:</strong> {org?.user_count}</div>
        </div>
      </div>
    </div>
  );
}
