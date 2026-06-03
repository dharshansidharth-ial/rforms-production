import React from "react";
import { useLocation } from "react-router-dom";

export default function ThankYou() {
  const location = useLocation();
  const state = location.state as any;
  const message = state?.message || "Thank you for your response!";
  const title = state?.title;
  const branding = state?.branding || {};

  return (
    <div className="thank-you-page">
      {branding.logo_url && <img src={branding.logo_url} alt="logo" className="form-logo" />}
      <div className="thank-you-icon" style={{ color: branding.primary_color || "#1a73e8" }}>✓</div>
      <h1>Response Submitted</h1>
      {title && <p className="form-name">{title}</p>}
      <p className="thank-you-message">{message}</p>
    </div>
  );
}
