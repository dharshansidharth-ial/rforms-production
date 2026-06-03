import React from "react";

export default function Home() {
  return (
    <div className="home-page">
      <div className="home-card">
        <div className="home-logo">
          <span className="home-logo-icon">R</span>
          <span className="home-logo-name">Forms</span>
        </div>
        <h1>Welcome to RForms</h1>
        <p>
          To fill out a form, use the link shared with you.<br />
          Form links look like: <code>/f/your-form-token</code>
        </p>
        <a
          href="http://localhost:3001"
          className="home-admin-link"
          rel="noopener noreferrer"
        >
          Go to Admin Portal →
        </a>
      </div>
    </div>
  );
}
