# RForms — Data Schemas

**Document type:** Schema Reference &nbsp;|&nbsp; **Version:** 1.0  
**Derived from:** RForms LLD v1.0 · RForms PRD v2.0

---

## Table of Contents

1. [Database Schemas (MySQL DDL)](#1-database-schemas-mysql-ddl)
2. [JSON Column Schemas](#2-json-column-schemas)
3. [SurveyJS Form Schema](#3-surveyjs-form-schema)
4. [Quiz Config Schema](#4-quiz-config-schema)
5. [API Request / Response Schemas](#5-api-request--response-schemas)
6. [JWT Payload Schema](#6-jwt-payload-schema)
7. [Redis Key Schema](#7-redis-key-schema)
8. [Sidekiq Job Payload Schemas](#8-sidekiq-job-payload-schemas)
9. [Audit Event Catalogue](#9-audit-event-catalogue)
10. [Field Type Reference](#10-field-type-reference)

---

## 1. Database Schemas (MySQL DDL)

### 1.1 `organizations`

Represents a Rediff Enterprise Email tenant. All other entities are scoped to an organization.

```sql
CREATE TABLE organizations (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Identity
  name                    VARCHAR(255)  NOT NULL            COMMENT 'Display name of the organization',
  domain                  VARCHAR(255)  UNIQUE              COMMENT 'Email domain, e.g. rediff.com — used for self-registration routing',

  -- Branding (org-level defaults applied to all forms)
  logo_url                TEXT                              COMMENT 'URL to org logo image',
  header_image_url        TEXT                              COMMENT 'URL to form header image',
  primary_color           VARCHAR(7)    DEFAULT '#1a73e8'  COMMENT 'Hex color for buttons, progress bar',
  accent_color            VARCHAR(7)    DEFAULT '#fbbc04'  COMMENT 'Hex color for accents',
  font                    VARCHAR(50)   DEFAULT 'Inter'    COMMENT 'Font family name for forms',

  -- Localization
  default_language        VARCHAR(10)   DEFAULT 'en'       COMMENT 'BCP-47 language tag, e.g. en, hi, mr',
  enabled_languages       JSON                             COMMENT 'Array of enabled language tags: ["en","hi"]',

  -- Policies
  mfa_required            TINYINT(1)    DEFAULT 0          COMMENT '1 = MFA enforced org-wide',
  sheets_capture_enabled  TINYINT(1)    DEFAULT 0          COMMENT '1 = Rediff Sheets capture enabled org-wide',

  -- Status
  status                  VARCHAR(20)   DEFAULT 'active'   COMMENT 'active | suspended',

  created_at              DATETIME(6)   NOT NULL,
  updated_at              DATETIME(6)   NOT NULL,

  INDEX ix_org_domain (domain),
  INDEX ix_org_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 1.2 `users`

All platform users: admins, creators, viewers, approvers, respondents.

```sql
CREATE TABLE users (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Tenant link
  organization_id  BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  -- Directory hierarchy (PRD §4)
  manager_id       BIGINT UNSIGNED NULL,
  FOREIGN KEY (manager_id) REFERENCES users(id),

  -- Identity
  email            VARCHAR(255) NOT NULL                   COMMENT 'Must be unique within org',
  name             VARCHAR(255) NOT NULL,
  password_digest  VARCHAR(255) NOT NULL                   COMMENT 'BCrypt hash',

  -- Role (PRD §5)
  -- Values: super_admin | org_admin | form_owner | editor | viewer | approver | analyst | responder
  role             VARCHAR(30)  NOT NULL DEFAULT 'form_owner',

  -- Profile
  department       VARCHAR(100) NULL,
  employee_id      VARCHAR(50)  NULL,
  avatar_url       TEXT         NULL,
  status           VARCHAR(20)  DEFAULT 'active'           COMMENT 'active | inactive | suspended',

  -- MFA (PRD §4, V2)
  mfa_enabled      TINYINT(1)   DEFAULT 0,
  mfa_secret       VARCHAR(255) NULL                       COMMENT 'TOTP secret key (stored encrypted)',
  mfa_method       VARCHAR(20)  DEFAULT 'totp'             COMMENT 'totp | email_otp | sms_otp',

  -- Session management
  jti              VARCHAR(36)  UNIQUE                     COMMENT 'JWT ID — nulled on logout to revoke all tokens',
  last_sign_in_at  DATETIME(6)  NULL,

  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,

  UNIQUE KEY uq_user_email_per_org (organization_id, email),
  INDEX ix_user_org       (organization_id),
  INDEX ix_user_jti       (jti),
  INDEX ix_user_role      (role),
  INDEX ix_user_status    (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Role definitions:**

| Role | Description | Can create forms? |
|---|---|---|
| `super_admin` | Platform-level admin; manages all orgs | ✓ |
| `org_admin` | Manages one organization | ✓ |
| `form_owner` | Creates and manages their own forms | ✓ |
| `editor` | Edits forms shared with them | ✗ |
| `viewer` | Views forms and optionally responses | ✗ |
| `approver` | Approves/rejects submitted responses | ✗ |
| `analyst` | Views dashboards and exports | ✗ |
| `responder` | Submits responses only | ✗ |

---

### 1.3 `forms`

The core entity. Stores both the form definition and all access/behavior settings.

```sql
CREATE TABLE forms (
  id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Ownership
  organization_id          BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  owner_id                 BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id),

  -- Content
  title                    VARCHAR(255) NOT NULL,
  description              TEXT         NULL,
  schema                   JSON         NULL           COMMENT 'SurveyJS JSON schema — see §3',

  -- Lifecycle
  status                   VARCHAR(20)  DEFAULT 'draft'
                           COMMENT 'draft | published | closed | archived',

  -- Customization
  branding                 JSON         NULL           COMMENT 'Per-form branding overrides — see §2.2',
  language_config          JSON         NULL           COMMENT 'Language settings — see §2.3',
  audience                 JSON         NULL           COMMENT 'Audience restriction — see §2.4',

  -- Quiz (PRD §29)
  is_quiz                  TINYINT(1)   DEFAULT 0,
  quiz_config              JSON         NULL           COMMENT 'Quiz answer keys & scoring — see §4',

  -- Access controls
  require_login            TINYINT(1)   DEFAULT 0      COMMENT '1 = respondent must authenticate',
  restrict_domains         VARCHAR(500) NULL           COMMENT 'Comma-separated allowed email domains',
  captcha_enabled          TINYINT(1)   DEFAULT 0,

  -- Submission behavior
  allow_multiple_submissions TINYINT(1) DEFAULT 1,
  single_response          TINYINT(1)   DEFAULT 0      COMMENT '1 = one response per authenticated user',
  response_cap             INT UNSIGNED NULL           COMMENT 'Max total responses; NULL = unlimited',
  opens_at                 DATETIME(6)  NULL           COMMENT 'Form opens at this time; NULL = immediately on publish',
  expires_at               DATETIME(6)  NULL           COMMENT 'Auto-close after this time; NULL = no expiry',

  -- UX
  show_progress_bar        TINYINT(1)   DEFAULT 1,
  confirmation_message     TEXT         NULL,
  redirect_url             VARCHAR(2048) NULL          COMMENT 'Post-submit redirect URL; overrides confirmation_message',

  -- Rediff Sheets integration (PRD §27)
  sheets_capture_enabled   TINYINT(1)   DEFAULT 0,
  sheets_url               VARCHAR(2048) NULL,

  -- Public access
  public_token             VARCHAR(32)  UNIQUE NOT NULL
                           COMMENT 'URL-safe token for /f/:token customer portal link',

  created_at               DATETIME(6)  NOT NULL,
  updated_at               DATETIME(6)  NOT NULL,

  INDEX ix_form_org_status  (organization_id, status),
  INDEX ix_form_owner       (owner_id),
  INDEX ix_form_status      (status),
  INDEX ix_form_expires     (expires_at),
  INDEX ix_form_opens       (opens_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 1.4 `form_permissions`

Explicit per-user role grants beyond their org-wide role. Enables sharing a form with specific editors, viewers, or approvers.

```sql
CREATE TABLE form_permissions (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  form_id     BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,

  user_id     BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  -- Scoped role on this specific form
  role        VARCHAR(20)  NOT NULL DEFAULT 'viewer'
              COMMENT 'editor | viewer | approver | analyst',

  created_at  DATETIME(6)  NOT NULL,
  updated_at  DATETIME(6)  NOT NULL,

  UNIQUE KEY uq_form_user_perm (form_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 1.5 `form_responses`

Stores both autosaved drafts and final submissions. The `is_draft` flag differentiates them.

```sql
CREATE TABLE form_responses (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Links
  form_id          BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,

  responder_id     BIGINT UNSIGNED NULL         COMMENT 'NULL for anonymous respondents',
  FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE SET NULL,

  responder_email  VARCHAR(255) NULL            COMMENT 'Captured for anonymous; mirrors user.email for authenticated',

  -- Payload
  payload          JSON         NULL            COMMENT '{field_name: value} — see §2.5',
  hidden_fields    JSON         NULL            COMMENT '{field_name: value} — URL params, SSO prefill',
  geo              JSON         NULL            COMMENT '{lat: float, lng: float, address?: string}',

  -- State
  status           VARCHAR(20)  DEFAULT 'submitted'
                   COMMENT 'submitted | under_review | approved | rejected',
  is_draft         TINYINT(1)   DEFAULT 0       COMMENT '1 = autosaved draft, 0 = final submission',

  -- Quiz scoring (PRD §29)
  score            FLOAT        NULL            COMMENT 'Total points earned',
  max_score        FLOAT        NULL            COMMENT 'Total possible points',

  -- Metadata
  ip_address       VARCHAR(45)  NULL,
  user_agent       TEXT         NULL,
  source_token     VARCHAR(255) NULL            COMMENT 'Distribution tracking token',
  submitted_at     DATETIME(6)  NULL            COMMENT 'Set on final submission; NULL for drafts',

  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,

  INDEX ix_resp_form_submitted  (form_id, submitted_at),
  INDEX ix_resp_responder       (responder_id),
  INDEX ix_resp_status          (status),
  INDEX ix_resp_draft           (is_draft),
  INDEX ix_resp_form_draft_user (form_id, is_draft, responder_id)
                                COMMENT 'For single-response check and draft resume'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 1.6 `audit_logs`

Append-only event trail. Never updated or deleted; supports compliance and export.

```sql
CREATE TABLE audit_logs (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  organization_id  BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  actor_id         BIGINT UNSIGNED NULL         COMMENT 'NULL for system-generated events',
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,

  event            VARCHAR(100) NOT NULL        COMMENT 'e.g. form_created — see §9 for full catalogue',
  target_type      VARCHAR(50)  NULL            COMMENT 'ActiveRecord class name: Form | FormResponse | User',
  target_id        BIGINT UNSIGNED NULL,
  metadata         JSON         NULL            COMMENT 'Contextual data (e.g. source_id for copies)',
  ip_address       VARCHAR(45)  NULL,

  created_at       DATETIME(6)  NOT NULL        COMMENT 'Indexed DESC for chronological query',

  INDEX ix_audit_org_ts     (organization_id, created_at DESC),
  INDEX ix_audit_event      (event),
  INDEX ix_audit_actor      (actor_id),
  INDEX ix_audit_target     (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 1.7 `templates`

Built-in global templates and org-specific custom templates.

```sql
CREATE TABLE templates (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  organization_id  BIGINT UNSIGNED NULL         COMMENT 'NULL = global template available to all orgs',
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,

  created_by_id    BIGINT UNSIGNED NULL,
  FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL,

  name             VARCHAR(255) NOT NULL,
  description      TEXT         NULL,
  category         VARCHAR(50)  NULL            COMMENT 'hr | sales | support | operations | education | event | other',
  schema           JSON         NULL            COMMENT 'SurveyJS JSON schema — same format as forms.schema',
  is_global        TINYINT(1)   DEFAULT 0       COMMENT '1 = seeded built-in, available to all orgs',
  thumbnail_url    TEXT         NULL,

  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,

  INDEX ix_tmpl_global   (is_global),
  INDEX ix_tmpl_org      (organization_id),
  INDEX ix_tmpl_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 2. JSON Column Schemas

### 2.1 `organizations.enabled_languages`

```json
["en", "hi", "mr", "ta", "te"]
```

Array of BCP-47 language tags. The first element is not necessarily the default; `default_language` column holds that.

---

### 2.2 `forms.branding`

Per-form branding overrides. Applied on top of `organizations` branding at render time.

```json
{
  "logo_url":         "https://cdn.example.com/logo.png",
  "header_image_url": "https://cdn.example.com/header.jpg",
  "primary_color":    "#d62929",
  "accent_color":     "#f5a623",
  "font":             "Roboto"
}
```

| Field | Type | Description |
|---|---|---|
| `logo_url` | string \| null | Displayed in form header |
| `header_image_url` | string \| null | Full-width banner image |
| `primary_color` | string | Hex color for buttons, progress bar |
| `accent_color` | string | Hex color for secondary accents |
| `font` | string | CSS font-family name |

---

### 2.3 `forms.language_config`

```json
{
  "default": "en",
  "enabled": ["en", "hi"],
  "rtl":     false
}
```

| Field | Type | Description |
|---|---|---|
| `default` | string | BCP-47 tag; used when respondent has no preference |
| `enabled` | string[] | Languages the respondent can switch to |
| `rtl` | boolean | Right-to-left layout for Arabic, Urdu, etc. |

---

### 2.4 `forms.audience`

Controls who can see and respond to a published form.

```json
{
  "type":   "restricted",
  "users":  [101, 204, 307],
  "groups": ["hr-team", "engineering"]
}
```

| Field | Type | Values | Description |
|---|---|---|---|
| `type` | string | `open` \| `restricted` | `open` = anyone with link; `restricted` = listed users/groups only |
| `users` | integer[] | user IDs | Explicit user list (only for `restricted`) |
| `groups` | string[] | group names | Group names resolved against org directory (only for `restricted`) |

---

### 2.5 `form_responses.payload`

The respondent's answers. Keys are SurveyJS question `name` values.

```json
{
  "full_name":         "Dharshan Sidharth",
  "department":        "Engineering",
  "work_mode":         "Hybrid",
  "satisfaction":      8,
  "feedback_text":     "Great onboarding process overall.",
  "skills_checkbox":   ["React", "Ruby", "Docker"],
  "start_date":        "2026-07-01",
  "attachment_key":    "uploads/org1/resp42/resume.pdf"
}
```

| Pattern | Description |
|---|---|
| String values | Text, paragraph, dropdown, single-select, date |
| Number values | Rating, scale, number inputs |
| Array of strings | Multi-select, checkbox groups |
| Boolean | Toggle questions |
| Storage path string | File upload — stores object storage key, not file content |

---

### 2.6 `form_responses.hidden_fields`

Fields not visible to the respondent. Populated from URL parameters or SSO prefill.

```json
{
  "source":       "email-campaign-q2",
  "campaign_id":  "CAMP_2026_Q2",
  "sso_dept":     "Engineering",
  "sso_emp_id":   "EMP001"
}
```

---

### 2.7 `form_responses.geo`

Captured with respondent consent via HTML5 Geolocation API.

```json
{
  "lat":     12.9716,
  "lng":     77.5946,
  "address": "Bengaluru, Karnataka, India",
  "consent": true
}
```

---

### 2.8 `audit_logs.metadata`

Flexible context object. Shape varies by event type.

```json
// form_copied
{ "source_id": 12 }

// form_published
{ "audience_type": "restricted", "audience_count": 45 }

// response_submitted
{ "is_quiz": true, "score": 8, "max_score": 10 }

// export_downloaded
{ "format": "csv", "response_count": 342 }

// user_updated
{ "changed_fields": ["role", "department"] }
```

---

## 3. SurveyJS Form Schema

The `forms.schema` column holds the native SurveyJS JSON format. SurveyJS Creator writes it; SurveyJS renderer reads it.

### 3.1 Root Structure

```json
{
  "title":                "Form title shown to respondent",
  "description":          "Optional subtitle / instructions",
  "showProgressBar":      "top",
  "goNextPageAutomatic":  false,
  "showQuestionNumbers":  "on",
  "pages": [ ... ],
  "calculatedValues":     [ ... ],
  "triggers":             [ ... ]
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | string | required | Heading displayed at top of form |
| `description` | string | null | Subheading / instructions |
| `showProgressBar` | `"top"` \| `"bottom"` \| `"off"` | `"top"` | Progress indicator position |
| `goNextPageAutomatic` | boolean | `false` | Auto-advance on single-choice answer |
| `showQuestionNumbers` | `"on"` \| `"off"` | `"on"` | Show question numbers |
| `pages` | Page[] | required | Array of pages (multi-step) |
| `calculatedValues` | CalcValue[] | `[]` | Hidden fields included in result |
| `triggers` | Trigger[] | `[]` | Conditional logic rules |

---

### 3.2 Page Object

```json
{
  "name":        "page1",
  "title":       "Personal Information",
  "description": "Please fill in your details",
  "elements":    [ ... ]
}
```

---

### 3.3 Element (Question) Object

```json
{
  "type":        "text",
  "name":        "full_name",
  "title":       "Full Name",
  "description": "As it appears on your ID",
  "isRequired":  true,
  "visible":     true,
  "readOnly":    false,
  "defaultValue": "Prefilled value or empty",
  "validators":  [
    { "type": "text", "minLength": 2, "maxLength": 100 }
  ],
  "visibleIf":   "{department} = 'HR'",
  "requiredIf":  "{employment_type} = 'Contract'"
}
```

---

### 3.4 All Supported Element Types

```json
// Short text
{ "type": "text", "name": "q", "inputType": "text" }

// Password (masked, encrypted at rest)
{ "type": "text", "name": "q", "inputType": "password" }

// Paragraph / multi-line
{ "type": "comment", "name": "q" }

// Single select (radio)
{ "type": "radiogroup", "name": "q", "choices": ["A", "B", "C"] }

// Multi select (checkboxes)
{ "type": "checkbox", "name": "q", "choices": ["X", "Y", "Z"] }

// Dropdown
{ "type": "dropdown", "name": "q", "choices": ["Option 1", "Option 2"] }

// Boolean toggle
{ "type": "boolean", "name": "q", "labelTrue": "Yes", "labelFalse": "No" }

// Date
{ "type": "text", "name": "q", "inputType": "date" }

// Date + time
{ "type": "text", "name": "q", "inputType": "datetime-local" }

// Number
{ "type": "text", "name": "q", "inputType": "number",
  "validators": [{ "type": "numeric", "minValue": 0, "maxValue": 100 }] }

// Rating (1–10)
{ "type": "rating", "name": "q", "rateMin": 1, "rateMax": 10 }

// Linear scale
{ "type": "rating", "name": "q", "rateMin": 0, "rateMax": 10, "rateStep": 1 }

// File upload
{ "type": "file", "name": "q", "maxSize": 10240,
  "acceptedTypes": ".pdf,.doc,.docx", "allowMultiple": false }

// Matrix grid
{ "type": "matrix", "name": "q",
  "rows": ["Row 1", "Row 2"],
  "columns": ["Col 1", "Col 2", "Col 3"] }

// Image picker
{ "type": "imagepicker", "name": "q",
  "choices": [{ "value": "cat", "imageLink": "https://..." }] }

// Panel (section / page group)
{ "type": "panel", "name": "section1", "title": "Section Title",
  "elements": [ ... ] }

// Geo-location (custom, HTML5 Geolocation)
{ "type": "text", "name": "geo_field", "inputType": "text",
  "rformsType": "geo", "consentLabel": "Allow location capture" }

// @mention (custom, directory-resolved)
{ "type": "text", "name": "tag_user", "rformsType": "mention" }

// Hidden field (included in result, not shown)
{ "type": "text", "name": "campaign_id", "visible": false }
```

---

### 3.5 Conditional Logic (visibleIf / triggers)

**Inline expression (simple):**
```json
{
  "name": "followup_question",
  "visibleIf": "{satisfaction} <= 5"
}
```

**Trigger-based (complex routing):**
```json
{
  "triggers": [
    {
      "type": "skiptrigger",
      "expression": "{department} = 'Engineering'",
      "gotoName": "page3"
    },
    {
      "type": "completetrigger",
      "expression": "{opt_out} = true"
    }
  ]
}
```

**Supported operators in expressions:**

| Operator | Symbol | Example |
|---|---|---|
| Equals | `=` | `{q} = 'value'` |
| Not equals | `<>` | `{q} <> 'value'` |
| Contains | `contains` | `{q} contains 'text'` |
| Greater than | `>` | `{rating} > 7` |
| Less than | `<` | `{score} < 50` |
| Greater or equal | `>=` | `{age} >= 18` |
| AND | `and` | `{q1} = 'A' and {q2} > 5` |
| OR | `or` | `{q1} = 'A' or {q2} = 'B'` |

---

## 4. Quiz Config Schema

Stored in `forms.quiz_config`. Only relevant when `forms.is_quiz = 1`.

```json
{
  "enabled":       true,
  "passThreshold": 0.6,
  "feedback":      "immediate",
  "answerKey": {
    "capital_q": {
      "correct":          "Paris",
      "points":           2,
      "caseInsensitive":  true,
      "explanation":      "Paris has been the French capital since 987 AD."
    },
    "multi_select_q": {
      "correct":  ["Earth", "Mars", "Venus"],
      "points":   3
    },
    "open_ended_q": {
      "manual":  true,
      "points":  10
    }
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `enabled` | boolean | ✓ | Must be `true` |
| `passThreshold` | float (0–1) | ✓ | Fraction of total points needed to pass (0.6 = 60%) |
| `feedback` | `"immediate"` \| `"after_review"` | ✓ | When to show score/answers to respondent |
| `answerKey` | object | ✓ | Map of question `name` → answer config |
| `answerKey[n].correct` | string \| string[] | ✗ | Expected answer(s); mutually exclusive with `manual` |
| `answerKey[n].points` | integer | ✓ | Points awarded for correct answer |
| `answerKey[n].caseInsensitive` | boolean | ✗ | Case-insensitive string comparison |
| `answerKey[n].explanation` | string | ✗ | Shown to respondent as feedback |
| `answerKey[n].manual` | boolean | ✗ | Requires human grading; score pending until reviewed |

---

## 5. API Request / Response Schemas

### 5.1 Pagination Envelope (all list endpoints)

```json
{
  "data_key": [ ... ],
  "meta": {
    "current_page": 1,
    "total_pages":  5,
    "total_count":  94,
    "per_page":     20
  }
}
```

### 5.2 Form Object (full)

Returned by `GET /forms/:id`, `POST /forms`, `PATCH /forms/:id`.

```json
{
  "id":             12,
  "title":          "Employee Feedback Q2",
  "description":    "Quarterly feedback survey",
  "status":         "published",
  "public_token":   "oltHjVzKct3TblCpQS0CGQ",
  "is_quiz":        false,
  "response_count": 342,
  "owner": {
    "id":   1,
    "name": "Org Admin"
  },
  "schema": { /* SurveyJS JSON — see §3 */ },
  "branding": {
    "logo_url":      null,
    "primary_color": "#d62929",
    "accent_color":  "#f5a623",
    "font":          "Inter"
  },
  "language_config": {
    "default": "en",
    "enabled": ["en"]
  },
  "audience": {
    "type":   "open",
    "users":  [],
    "groups": []
  },
  "quiz_config": null,
  "settings": {
    "require_login":            false,
    "single_response":          false,
    "allow_multiple_submissions": true,
    "response_cap":             null,
    "opens_at":                 null,
    "expires_at":               "2026-12-31T23:59:59.000Z",
    "captcha_enabled":          false,
    "show_progress_bar":        true,
    "confirmation_message":     "Thank you for your response!",
    "redirect_url":             null,
    "sheets_capture_enabled":   false,
    "sheets_url":               null
  },
  "created_at": "2026-06-01T08:00:00.000Z",
  "updated_at": "2026-06-03T10:00:00.000Z"
}
```

### 5.3 Form Object (summary — list view)

```json
{
  "id":             12,
  "title":          "Employee Feedback Q2",
  "description":    "Quarterly feedback survey",
  "status":         "published",
  "public_token":   "oltHjVzKct3TblCpQS0CGQ",
  "is_quiz":        false,
  "response_count": 342,
  "owner": { "id": 1, "name": "Org Admin" },
  "created_at":     "2026-06-01T08:00:00.000Z",
  "updated_at":     "2026-06-03T10:00:00.000Z"
}
```

### 5.4 Response Object

```json
{
  "id":             98,
  "form_id":        12,
  "payload":        { "full_name": "Jane Doe", "department": "HR" },
  "status":         "submitted",
  "is_draft":       false,
  "score":          null,
  "max_score":      null,
  "responder_email": "jane@rediff.com",
  "submitted_at":   "2026-06-03T10:15:00.000Z",
  "created_at":     "2026-06-03T10:10:00.000Z"
}
```

### 5.5 Analytics Object

```json
{
  "form_id": 12,
  "overview": {
    "total_responses":  342,
    "completion_rate":  87.5,
    "today":            12,
    "this_week":        78
  },
  "trend": [
    { "date": "2026-05-28", "count": 23 },
    { "date": "2026-05-29", "count": 31 },
    { "date": "2026-05-30", "count": 18 }
  ],
  "question_breakdown": [
    {
      "question": "Preferred Work Mode",
      "name":     "work_mode",
      "type":     "radiogroup",
      "choices": [
        { "value": "Remote", "count": 189 },
        { "value": "Hybrid", "count": 102 },
        { "value": "Office", "count": 51  }
      ]
    }
  ],
  "quiz": null
}
```

### 5.6 User Object

```json
{
  "id":              5,
  "email":           "creator@rediff.com",
  "name":            "Form Creator",
  "role":            "form_owner",
  "department":      "Engineering",
  "employee_id":     "EMP042",
  "status":          "active",
  "mfa_enabled":     false,
  "last_sign_in_at": "2026-06-03T09:00:00.000Z",
  "manager": {
    "id":   1,
    "name": "Org Admin"
  }
}
```

### 5.7 Organization Object

```json
{
  "id":     1,
  "name":   "Rediff Communications",
  "domain": "rediff.com",
  "branding": {
    "logo_url":         null,
    "header_image_url": null,
    "primary_color":    "#d62929",
    "accent_color":     "#f5a623",
    "font":             "Inter"
  },
  "default_language":       "en",
  "enabled_languages":      ["en"],
  "mfa_required":           false,
  "sheets_capture_enabled": false,
  "user_count":             24
}
```

### 5.8 Audit Log Entry

```json
{
  "id":          8821,
  "event":       "form_published",
  "actor": {
    "id":    1,
    "name":  "Org Admin",
    "email": "admin@rediff.com"
  },
  "target_type": "Form",
  "target_id":   12,
  "metadata":    { "audience_type": "open" },
  "ip_address":  "203.0.113.42",
  "created_at":  "2026-06-03T10:05:00.000Z"
}
```

### 5.9 Standard Error Response

All errors follow this shape:

```json
{
  "error":   "Human-readable error message",
  "details": ["Specific field: validation message"]
}
```

`details` is only present for 422 validation errors.

---

## 6. JWT Payload Schema

### 6.1 Access Token Payload

```json
{
  "user_id": 1,
  "org_id":  1,
  "role":    "org_admin",
  "jti":     "8017feb-eb04-4c4c-9c8d-ad9a633d331a",
  "exp":     1780492446,
  "iat":     1780406046
}
```

| Field | Type | Description |
|---|---|---|
| `user_id` | integer | References `users.id` |
| `org_id` | integer | References `organizations.id` |
| `role` | string | User's role at time of login |
| `jti` | UUID v4 string | Matches `users.jti`; differs after logout = token revoked |
| `exp` | Unix timestamp | Expiry: `iat + 24 hours` |
| `iat` | Unix timestamp | Issued at time |

### 6.2 Token Lifecycle

```
Issue:    POST /auth/login          → generates token, sets user.jti = payload.jti
Validate: every authenticated call  → decode token, verify user.jti == payload.jti
Revoke:   DELETE /auth/logout       → user.jti = SecureRandom.uuid (new UUID invalidates old token)
Expiry:   exp < Time.current        → JwtService raises AuthenticationError("Token expired")
```

### 6.3 Algorithm

```
Algorithm:  HS256 (HMAC-SHA256)
Secret:     ENV['SECRET_KEY_BASE']  (256-bit random, never committed)
Storage:    localStorage            (admin: rforms_token, customer: rforms_customer_token)
Transport:  Authorization: Bearer <token>  (HTTP header)
```

---

## 7. Redis Key Schema

All keys use colons as namespace separators. TTLs are set with `SETEX` / `EXPIRE`.

| Key Pattern | Type | TTL | Content | Set by | Invalidated by |
|---|---|---|---|---|---|
| `form:schema:{form_id}` | STRING | 24h | Published form JSON schema (string) | `POST /forms/:id/publish` | Same publish endpoint; form update; delete |
| `org:branding:{org_id}` | STRING | 1h | Org branding JSON (string) | `PATCH /organization` | Same update endpoint |
| `rate:login:{ip}` | STRING | 60s | Integer attempt count | `POST /auth/login` | TTL auto-expiry |
| `rate:submit:{ip}` | STRING | 60s | Integer submission count | `POST /public/.../responses` | TTL auto-expiry |
| `mfa:otp:{user_id}` | STRING | 300s | 6-digit OTP code | `POST /auth/mfa/challenge` | `POST /auth/mfa/verify` or TTL |
| `sidekiq:queue:{name}` | LIST | none | Serialized job JSON | Sidekiq workers | Consumed by Sidekiq |

### 7.1 `form:schema:{id}` Value Format

```
Key:    form:schema:12
Value:  {"title":"Employee Feedback Q2","showProgressBar":"top","pages":[...]}
TTL:    86400 seconds (24h)
```

### 7.2 Sidekiq Queue Names

| Queue | Priority | Workers |
|---|---|---|
| `critical` | Highest | MFA OTP delivery |
| `default` | Medium | Email invites, notifications, AI gen |
| `low` | Lowest | Sheets sync, PDF generation, analytics rollups |

---

## 8. Sidekiq Job Payload Schemas

Each Sidekiq job is serialized as JSON in Redis. The `args` array contains positional parameters.

### 8.1 `SheetsAppendWorker`

```json
{
  "class":  "SheetsAppendWorker",
  "queue":  "low",
  "retry":  5,
  "args":   [98],
  "jid":    "abc123",
  "at":     1780406050
}
```

`args[0]` = `form_response_id` (integer)

### 8.2 `PdfGenWorker`

```json
{
  "class":  "PdfGenWorker",
  "queue":  "low",
  "retry":  3,
  "args":   [98],
  "jid":    "def456"
}
```

`args[0]` = `form_response_id` (integer)

### 8.3 `EmailInviteWorker`

```json
{
  "class":  "EmailInviteWorker",
  "queue":  "default",
  "retry":  3,
  "args":   [12],
  "jid":    "ghi789"
}
```

`args[0]` = `form_id` (integer)

### 8.4 `AiFormGenWorker`

```json
{
  "class":  "AiFormGenWorker",
  "queue":  "default",
  "retry":  2,
  "args":   ["Create an IT access request form with approver routing", null, 1],
  "jid":    "jkl012"
}
```

`args[0]` = prompt (string)  
`args[1]` = source_doc_storage_key (string | null)  
`args[2]` = requesting_user_id (integer)

---

## 9. Audit Event Catalogue

All events written to `audit_logs.event`. Used for compliance reports, admin dashboards, and operational monitoring.

| Event | Trigger | `target_type` | Key `metadata` fields |
|---|---|---|---|
| `login` | Successful authentication | `User` | — |
| `logout` | DELETE /auth/logout | `User` | — |
| `user_created` | POST /users | `User` | `role` |
| `user_updated` | PATCH /users/:id | `User` | `changed_fields[]` |
| `user_deleted` | DELETE /users/:id (deactivate) | `User` | — |
| `form_created` | POST /forms | `Form` | `title` |
| `form_updated` | PATCH /forms/:id | `Form` | — |
| `form_published` | POST /forms/:id/publish | `Form` | `audience_type` |
| `form_deleted` | DELETE /forms/:id | `Form` | `title` |
| `form_copied` | POST /forms/:id/copy | `Form` | `source_id` |
| `response_submitted` | Final submit (is_draft=false) | `FormResponse` | `is_quiz`, `score`, `max_score` |
| `export_downloaded` | GET .../responses/export | `Form` | `format`, `response_count` |
| `approval_requested` | Workflow creates ApprovalTask | `FormResponse` | `approver_id` |
| `approval_completed` | Approver decides | `FormResponse` | `decision` (approved/rejected) |
| `org_settings_updated` | PATCH /organization | `Organization` | `changed_fields[]` |
| `quiz_scored` | calculate_score! | `FormResponse` | `score`, `max_score`, `passed` |
| `document_generated` | PdfGenWorker completes | `FormResponse` | `kind`, `storage_key` |
| `sheet_synced` | SheetsAppendWorker completes | `FormResponse` | `sheet_url` |

---

## 10. Field Type Reference

### 10.1 Validation Rules per SurveyJS Type

| SurveyJS `type` | Built-in validators | Custom validators |
|---|---|---|
| `text` (short_text) | `minLength`, `maxLength`, `regex` | — |
| `text` (password) | `minLength` | Field-level AES-256 encryption before store |
| `comment` | `minLength`, `maxLength` | — |
| `text` (number) | `minValue`, `maxValue` | `integer` check |
| `text` (date) | `minValue`, `maxValue` | ISO 8601 format check |
| `radiogroup` | `isRequired` | — |
| `checkbox` | `minSelectedChoices`, `maxSelectedChoices` | — |
| `dropdown` | `isRequired` | — |
| `rating` | `rateMin`, `rateMax` | — |
| `file` | `maxSize` (KB), `acceptedTypes` | Virus scan (V2) |
| `matrix` | `isAllRowRequired` | — |

### 10.2 Response Value Types by Question Type

| Question type | Stored in `payload` as | Example |
|---|---|---|
| Short text | string | `"Jane Doe"` |
| Paragraph | string | `"Long form answer..."` |
| Password | string (encrypted) | `"[AES-256-ENCRYPTED]"` |
| Single select / radio | string | `"Option A"` |
| Multi select / checkbox | string[] | `["A", "C"]` |
| Dropdown | string | `"Option B"` |
| Boolean toggle | boolean | `true` |
| Date | string (ISO 8601) | `"2026-07-01"` |
| Date-time | string (ISO 8601) | `"2026-07-01T09:00:00"` |
| Number | number | `42` |
| Rating | number | `8` |
| File upload | string (storage key) | `"uploads/org1/resp98/file.pdf"` |
| Matrix | object | `{"Row1": "ColA", "Row2": "ColC"}` |
| Geo-location | stored in `form_responses.geo` | `{lat, lng, address}` |
| Hidden field | stored in `form_responses.hidden_fields` | `"campaign-q2"` |
