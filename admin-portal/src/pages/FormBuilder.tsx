import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SurveyCreatorComponent, SurveyCreator } from "survey-creator-react";
import { formsApi, templatesApi } from "../api/forms";
import toast from "react-hot-toast";
import { Save, Send, ArrowLeft, Settings, X, Layers } from "lucide-react";
import "survey-core/survey-core.min.css";
import "survey-creator-core/survey-creator-core.min.css";

const CREATOR_OPTIONS = {
  showLogicTab: true,
  showTranslationTab: true,
  showThemeTab: true,
  isAutoSave: false,
  showPreviewTab: true,
  showJSONEditorTab: true,
  // haveCommercialLicense removed — deprecated in v2.x, use setLicenseKey() instead
};

export default function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [form, setForm]               = useState<any>(null);
  const [loading, setLoading]         = useState(!isNew);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates]     = useState<any[]>([]);
  const [settings, setSettings]       = useState({
    require_login:             false,
    single_response:           false,
    allow_multiple_submissions: true,
    captcha_enabled:           false,
    show_progress_bar:         true,
    is_quiz:                   false,
    response_cap:              "",
    opens_at:                  "",
    expires_at:                "",
    confirmation_message:      "Thank you for your response!",
    redirect_url:              "",
  });

  // Create creator once — useMemo prevents re-creation on every render
  const creator = useMemo(() => new SurveyCreator(CREATOR_OPTIONS), []);

  // Load templates for the picker
  useEffect(() => {
    templatesApi.list()
      .then((res) => setTemplates(res.data.templates))
      .catch(() => {}); // templates are optional — silent fail is fine
  }, []);

  // Load existing form data when editing
  useEffect(() => {
    if (isNew) {
      setLoading(false);
      setShowTemplates(true); // open template picker for new forms
      return;
    }
    if (!id) return;

    setLoading(true);
    setLoadError(null);

    formsApi.get(Number(id))
      .then((res) => {
        const f = res.data.form;
        setForm(f);
        setSettings((prev) => ({
          ...prev,
          ...(f.settings || {}),
          is_quiz: f.is_quiz ?? false,
        }));
        // Load schema into creator after state is set
        if (f.schema && Object.keys(f.schema).length > 0) {
          creator.JSON = f.schema;
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.error || "Failed to load form";
        setLoadError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, [id, isNew, creator]);

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      const schema = creator.JSON;
      const title  = (schema as any)?.title || form?.title || "Untitled Form";

      const payload = {
        title,
        schema,
        ...settings,
        response_cap: settings.response_cap ? Number(settings.response_cap) : null,
        opens_at:     settings.opens_at  || null,
        expires_at:   settings.expires_at || null,
      };

      let savedForm: any;
      if (isNew) {
        const res = await formsApi.create(payload);
        savedForm = res.data.form;
        toast.success("Form created!");
      } else {
        const res = await formsApi.update(Number(id), payload);
        savedForm = res.data.form;
        toast.success("Form saved!");
      }

      if (publish && savedForm?.status !== "published") {
        await formsApi.publish(savedForm.id);
        toast.success("Form published!");
      }

      // Navigate to the edit URL so the form ID is in the URL
      if (isNew) navigate(`/forms/${savedForm.id}/edit`, { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUseTemplate = (template: any) => {
    creator.JSON = template.schema;
    setShowTemplates(false);
    toast.success(`Template loaded: ${template.name}`);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="builder-page">
        <div className="builder-toolbar">
          <button className="btn-icon" onClick={() => navigate("/forms")}>
            <ArrowLeft size={18} />
          </button>
          <div className="builder-title">Loading form…</div>
        </div>
        <div className="page-loading">Loading form data…</div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="builder-page">
        <div className="builder-toolbar">
          <button className="btn-icon" onClick={() => navigate("/forms")}>
            <ArrowLeft size={18} />
          </button>
          <div className="builder-title">Error</div>
        </div>
        <div className="page-loading" style={{ flexDirection: "column", gap: 16 }}>
          <p style={{ color: "#ea4335" }}>{loadError}</p>
          <button className="btn-primary" onClick={() => navigate("/forms")}>
            Back to Forms
          </button>
        </div>
      </div>
    );
  }

  // ── Builder ────────────────────────────────────────────────────────────────
  return (
    <div className="builder-page">
      <div className="builder-toolbar">
        <button className="btn-icon" onClick={() => navigate("/forms")} title="Back to forms">
          <ArrowLeft size={18} />
        </button>
        <div className="builder-title">
          {isNew ? "New Form" : (form?.title || "Edit Form")}
        </div>
        <div className="builder-actions">
          <button className="btn-icon" onClick={() => setShowTemplates(true)} title="Templates">
            <Layers size={17} />
          </button>
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
            <Settings size={17} />
          </button>
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
            <Save size={15} /> {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
            <Send size={15} /> Publish
          </button>
        </div>
      </div>

      <div className="builder-body">
        {/* SurveyJS Creator */}
        <div className="creator-wrapper">
          <SurveyCreatorComponent creator={creator} />
        </div>

        {/* Settings side panel */}
        {showSettings && (
          <div className="settings-panel">
            <div className="panel-header">
              <h3>Form Settings</h3>
              <button onClick={() => setShowSettings(false)}><X size={16} /></button>
            </div>
            <div className="settings-content">
              <label className="toggle-row">
                <span>Require Login</span>
                <input type="checkbox" checked={settings.require_login}
                  onChange={(e) => setSettings((s) => ({ ...s, require_login: e.target.checked }))} />
              </label>
              <label className="toggle-row">
                <span>Single Response per User</span>
                <input type="checkbox" checked={settings.single_response}
                  onChange={(e) => setSettings((s) => ({ ...s, single_response: e.target.checked }))} />
              </label>
              <label className="toggle-row">
                <span>CAPTCHA</span>
                <input type="checkbox" checked={settings.captcha_enabled}
                  onChange={(e) => setSettings((s) => ({ ...s, captcha_enabled: e.target.checked }))} />
              </label>
              <label className="toggle-row">
                <span>Progress Bar</span>
                <input type="checkbox" checked={settings.show_progress_bar}
                  onChange={(e) => setSettings((s) => ({ ...s, show_progress_bar: e.target.checked }))} />
              </label>
              <label className="toggle-row">
                <span>Quiz Mode</span>
                <input type="checkbox" checked={settings.is_quiz}
                  onChange={(e) => setSettings((s) => ({ ...s, is_quiz: e.target.checked }))} />
              </label>
              <div className="settings-field">
                <label>Response Limit</label>
                <input type="number" placeholder="Unlimited" value={settings.response_cap}
                  onChange={(e) => setSettings((s) => ({ ...s, response_cap: e.target.value }))} />
              </div>
              <div className="settings-field">
                <label>Opens At</label>
                <input type="datetime-local" value={settings.opens_at}
                  onChange={(e) => setSettings((s) => ({ ...s, opens_at: e.target.value }))} />
              </div>
              <div className="settings-field">
                <label>Expires At</label>
                <input type="datetime-local" value={settings.expires_at}
                  onChange={(e) => setSettings((s) => ({ ...s, expires_at: e.target.value }))} />
              </div>
              <div className="settings-field">
                <label>Confirmation Message</label>
                <textarea value={settings.confirmation_message}
                  onChange={(e) => setSettings((s) => ({ ...s, confirmation_message: e.target.value }))} />
              </div>
              <div className="settings-field">
                <label>Redirect URL (after submit)</label>
                <input type="url" placeholder="https://…" value={settings.redirect_url}
                  onChange={(e) => setSettings((s) => ({ ...s, redirect_url: e.target.value }))} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Template picker modal */}
      {showTemplates && (
        <div className="modal-overlay" onClick={() => setShowTemplates(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Choose a Template</h3>
              <button onClick={() => setShowTemplates(false)}><X size={18} /></button>
            </div>
            <div className="templates-grid">
              <div className="template-card blank" onClick={() => setShowTemplates(false)}>
                <div className="template-icon">+</div>
                <div className="template-name">Blank Form</div>
              </div>
              {templates.map((t) => (
                <div key={t.id} className="template-card" onClick={() => handleUseTemplate(t)}>
                  <div className="template-category">{t.category}</div>
                  <div className="template-name">{t.name}</div>
                  <div className="template-desc">{t.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
