import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SurveyCreatorComponent, SurveyCreator } from "survey-creator-react";
import { formsApi, templatesApi } from "../api/forms";
import toast from "react-hot-toast";
import { Save, Send, ArrowLeft, Settings, Eye, X, Layers } from "lucide-react";
import "survey-core/survey-core.min.css";
import "survey-creator-core/survey-creator-core.min.css";

const CREATOR_OPTIONS = {
  showLogicTab: true,
  showTranslationTab: true,
  showThemeTab: true,
  isAutoSave: false,
  showPreviewTab: true,
  showJSONEditorTab: true,
  haveCommercialLicense: false,
};

export default function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(isNew);
  const [templates, setTemplates] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    require_login: false,
    single_response: false,
    allow_multiple_submissions: true,
    captcha_enabled: false,
    show_progress_bar: true,
    is_quiz: false,
    response_cap: "",
    opens_at: "",
    expires_at: "",
    confirmation_message: "Thank you for your response!",
    redirect_url: "",
  });

  const creatorRef = useRef<SurveyCreator | null>(null);

  useEffect(() => {
    templatesApi.list().then((res) => setTemplates(res.data.templates));
  }, []);

  useEffect(() => {
    if (!isNew && id) {
      formsApi.get(Number(id)).then((res) => {
        setForm(res.data.form);
        setSettings((prev) => ({ ...prev, ...res.data.form.settings, is_quiz: res.data.form.is_quiz }));
        setLoading(false);
      });
    }
  }, [id, isNew]);

  const getCreator = useCallback(() => {
    if (!creatorRef.current) {
      creatorRef.current = new SurveyCreator(CREATOR_OPTIONS);
    }
    return creatorRef.current;
  }, []);

  const creator = getCreator();

  useEffect(() => {
    if (!loading && form?.schema) {
      try {
        creator.JSON = form.schema;
        creator.text = form.title || "";
      } catch {}
    }
  }, [loading, form, creator]);

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      const schema = creator.JSON;
      const title = (schema as any)?.title || "Untitled Form";

      const payload = {
        title,
        schema,
        ...settings,
        response_cap: settings.response_cap ? Number(settings.response_cap) : null,
        opens_at: settings.opens_at || null,
        expires_at: settings.expires_at || null,
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

      navigate(`/forms/${savedForm.id}/edit`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUseTemplate = async (template: any) => {
    creator.JSON = template.schema;
    setShowTemplates(false);
    toast.success(`Loaded template: ${template.name}`);
  };

  // if (loading) return <div className="page-loading">Loading form...</div>;

  return (
    <div className="builder-page">
      <div className="builder-toolbar">
        <button className="btn-icon" onClick={() => navigate("/forms")} title="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="builder-title">
          {isNew ? "New Form" : form?.title}
        </div>
        <div className="builder-actions">
          <button className="btn-icon" onClick={() => setShowTemplates(true)} title="Templates">
            <Layers size={17} />
          </button>
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
            <Settings size={17} />
          </button>
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
            <Save size={15} /> {saving ? "Saving..." : "Save"}
          </button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
            <Send size={15} /> Publish
          </button>
        </div>
      </div>

      <div className="builder-body">
        <div className="creator-wrapper">
          <SurveyCreatorComponent creator={creator} />
        </div>

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
                <input type="url" placeholder="https://..." value={settings.redirect_url}
                  onChange={(e) => setSettings((s) => ({ ...s, redirect_url: e.target.value }))} />
              </div>
            </div>
          </div>
        )}
      </div>

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
