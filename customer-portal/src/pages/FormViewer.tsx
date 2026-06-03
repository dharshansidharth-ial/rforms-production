import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import client from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import toast from "react-hot-toast";
import "survey-core/survey-core.min.css";

export default function FormViewer() {
  const { token } = useParams<{ token: string }>();
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [form, setForm]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const draftId       = useRef<number | null>(null);

  useEffect(() => {
    client.get(`/public/forms/${token}`)
      .then((res) => setForm(res.data.form))
      .catch((err) => {
        if (err.response?.status === 404) setError("Form not found");
        else if (err.response?.status === 410) setError("This form is no longer accepting responses.");
        else setError("This form is not available.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Redirect to login if form requires auth and user is not logged in
  useEffect(() => {
    if (form && form.settings?.require_login && !user) {
      navigate(`/login?from=/f/${token}`, { replace: true });
    }
  }, [form, user, token, navigate]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <p>Loading form...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-page">
        <div className="error-icon">⚠️</div>
        <h2>Form Unavailable</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!form) return null;

  // Still waiting for auth redirect
  if (form.settings?.require_login && !user) return null;

  const branding = form.branding || {};

  const surveyModel = new Model(form.schema);
  surveyModel.showProgressBar = form.settings?.show_progress_bar ? "top" : "off";
  surveyModel.completeText    = "Submit";

  // Apply brand colour to SurveyJS buttons
  if (branding.primary_color) {
    const styleId = "rforms-brand-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .sd-btn--action { background-color: ${branding.primary_color} !important; border-color: ${branding.primary_color} !important; }
        .sd-progress__bar { background-color: ${branding.primary_color} !important; }
        .sd-item__decorator { border-color: ${branding.primary_color} !important; }
      `;
      document.head.appendChild(style);
    }
  }

  const handleValueChanged = (_: Model, options: any) => {
    if (!options || options.name === undefined) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const payload = { payload: surveyModel.data, is_draft: true };
        if (draftId.current) {
          await client.patch(`/public/forms/${token}/responses/${draftId.current}`, payload);
        } else {
          const res = await client.post(`/public/forms/${token}/responses`, payload);
          draftId.current = res.data.response?.id ?? null;
        }
      } catch { /* auto-save is best-effort */ }
    }, 2000);
  };

  const handleComplete = async (survey: Model) => {
    try {
      await client.post(`/public/forms/${token}/responses`, {
        payload: survey.data,
        is_draft: false,
      });

      if (form.settings?.redirect_url) {
        window.location.href = form.settings.redirect_url;
      } else {
        navigate("/thank-you", {
          state: {
            message: form.settings?.confirmation_message || "Thank you for your response!",
            title:   form.title,
            branding,
          },
        });
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || "Submission failed. Please try again.";
      toast.error(msg);
      survey.clear(false, false);
    }
  };

  surveyModel.onValueChanged.add(handleValueChanged);

  return (
    <div className="form-page" style={{ fontFamily: branding.font || "Inter" }}>
      {branding.logo_url && (
        <div className="form-header">
          <img src={branding.logo_url} alt="logo" className="form-logo" />
          {user && (
            <div className="form-user-badge">
              Signed in as <strong>{user.email}</strong>
            </div>
          )}
        </div>
      )}
      {!branding.logo_url && user && (
        <div className="form-header">
          <div className="form-user-badge">
            Signed in as <strong>{user.email}</strong>
          </div>
        </div>
      )}
      <div className="form-container">
        <Survey model={surveyModel} onComplete={handleComplete} />
      </div>
    </div>
  );
}
