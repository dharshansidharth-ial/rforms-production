# Rediff Enterprise Forms (RForms)
## Low-Level Design (LLD)

**Document type:** Detailed Design / LLD &nbsp;|&nbsp; **Version:** 1.0 &nbsp;|&nbsp; **Status:** Approved  
**Derived from:** RForms PRD v2.0 · **Companion to:** RForms HLD v1.0

---

## Table of Contents

1. [Introduction & Conventions](#1-introduction--conventions)
2. [Database Schema](#2-database-schema)
3. [Canonical Form Schema (SurveyJS JSON)](#3-canonical-form-schema-surveyjs-json)
4. [API Specification](#4-api-specification)
5. [Rails Model Design](#5-rails-model-design)
6. [Service Layer Design](#6-service-layer-design)
7. [Policy Layer (RBAC)](#7-policy-layer-rbac)
8. [Form Logic Engine](#8-form-logic-engine)
9. [Quiz Scoring Algorithm](#9-quiz-scoring-algorithm)
10. [Authentication & JWT Design](#10-authentication--jwt-design)
11. [Background Job Design (Sidekiq)](#11-background-job-design-sidekiq)
12. [Frontend Component Design](#12-frontend-component-design)
13. [State Machines](#13-state-machines)
14. [Error Handling](#14-error-handling)
15. [Caching Design](#15-caching-design)
16. [Reliability & Concurrency](#16-reliability--concurrency)

---

## 1. Introduction & Conventions

This LLD specifies **how** RForms is implemented. It translates each HLD service into concrete schemas, API contracts, class designs, and algorithms. Build all Ruby code with Rails 8.1 (API mode) and MySQL 8 as the primary database. TypeScript/React frontends use SurveyJS.

**Conventions:**
- All API paths are relative to `/api/v1` and authenticated via `Authorization: Bearer <JWT>` unless marked `[public]`
- All IDs are auto-incrementing `BIGINT` (Rails default); timestamps are `DATETIME(6)` in UTC
- Every tenant-scoped table has `organization_id BIGINT NOT NULL`
- JSON columns use MySQL `JSON` type; Rails serializes via `store_accessor` or direct attribute access
- Responses follow RFC 7807 (`application/problem+json`) on error

---

## 2. Database Schema

### 2.1 Entity Relationship Diagram

```
organizations ──┬── users ──────────────┬── forms ──────────────┬── form_permissions
                │   (manager_id → users) │   (owner_id → users)  │
                │                        │                        ├── form_responses
                │                        │                        │   (responder_id → users)
                ├── templates            │                        │
                │                        │                        └── audit_logs
                └── audit_logs           └── templates                (actor_id → users)
```

### 2.2 `organizations`

```sql
CREATE TABLE organizations (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                    VARCHAR(255)  NOT NULL,
  domain                  VARCHAR(255)  UNIQUE,                -- email domain e.g. rediff.com
  logo_url                TEXT,
  header_image_url        TEXT,
  primary_color           VARCHAR(7)    DEFAULT '#1a73e8',
  accent_color            VARCHAR(7)    DEFAULT '#fbbc04',
  font                    VARCHAR(50)   DEFAULT 'Inter',
  default_language        VARCHAR(10)   DEFAULT 'en',
  enabled_languages       JSON,                                -- ["en","hi","mr"]
  mfa_required            TINYINT(1)    DEFAULT 0,
  sheets_capture_enabled  TINYINT(1)    DEFAULT 0,
  status                  VARCHAR(20)   DEFAULT 'active',      -- active|suspended
  created_at              DATETIME(6)   NOT NULL,
  updated_at              DATETIME(6)   NOT NULL
);
```

### 2.3 `users`

```sql
CREATE TABLE users (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id  BIGINT UNSIGNED NOT NULL REFERENCES organizations(id),
  manager_id       BIGINT UNSIGNED          REFERENCES users(id),  -- directory hierarchy
  email            VARCHAR(255)  NOT NULL,
  name             VARCHAR(255)  NOT NULL,
  password_digest  VARCHAR(255)  NOT NULL,                         -- BCrypt
  role             VARCHAR(30)   NOT NULL DEFAULT 'form_owner',    -- see roles below
  department       VARCHAR(100),
  employee_id      VARCHAR(50),
  status           VARCHAR(20)   DEFAULT 'active',                 -- active|inactive|suspended
  mfa_enabled      TINYINT(1)    DEFAULT 0,
  mfa_secret       VARCHAR(255),                                   -- TOTP secret (encrypted)
  mfa_method       VARCHAR(20)   DEFAULT 'totp',                   -- totp|email_otp|sms_otp
  avatar_url       TEXT,
  jti              VARCHAR(36)   UNIQUE,                           -- JWT revocation token
  last_sign_in_at  DATETIME(6),
  created_at       DATETIME(6)   NOT NULL,
  updated_at       DATETIME(6)   NOT NULL,

  UNIQUE KEY uq_user_org_email (organization_id, email),
  INDEX ix_user_org (organization_id),
  INDEX ix_user_jti (jti)
);

-- Roles: super_admin | org_admin | form_owner | editor | viewer | approver | analyst | responder
```

### 2.4 `forms`

```sql
CREATE TABLE forms (
  id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id          BIGINT UNSIGNED NOT NULL REFERENCES organizations(id),
  owner_id                 BIGINT UNSIGNED NOT NULL REFERENCES users(id),
  title                    VARCHAR(255)  NOT NULL,
  description              TEXT,
  schema                   JSON,                            -- SurveyJS JSON schema
  status                   VARCHAR(20)   DEFAULT 'draft',   -- draft|published|closed|archived
  branding                 JSON,                            -- per-form brand overrides
  language_config          JSON,                            -- {default:"en", enabled:["en","hi"]}
  audience                 JSON,                            -- {type:"open"|"restricted", users:[], groups:[]}
  quiz_config              JSON,                            -- null = not a quiz; see §9
  is_quiz                  TINYINT(1)    DEFAULT 0,
  require_login            TINYINT(1)    DEFAULT 0,
  restrict_domains         VARCHAR(500),                    -- comma-separated allowed domains
  captcha_enabled          TINYINT(1)    DEFAULT 0,
  allow_multiple_submissions TINYINT(1)  DEFAULT 1,
  single_response          TINYINT(1)    DEFAULT 0,         -- enforced by unique index on responses
  response_cap             INT UNSIGNED,                    -- null = unlimited
  opens_at                 DATETIME(6),                     -- null = immediately on publish
  expires_at               DATETIME(6),                     -- null = never expires
  show_progress_bar        TINYINT(1)    DEFAULT 1,
  confirmation_message     TEXT          DEFAULT 'Thank you for your response!',
  redirect_url             VARCHAR(2048),                   -- post-submit redirect
  sheets_capture_enabled   TINYINT(1)    DEFAULT 0,
  sheets_url               VARCHAR(2048),                   -- Rediff Sheet URL
  public_token             VARCHAR(32)   UNIQUE NOT NULL,   -- URL-safe base64 for /f/:token
  created_at               DATETIME(6)   NOT NULL,
  updated_at               DATETIME(6)   NOT NULL,

  INDEX ix_form_org_status (organization_id, status),
  INDEX ix_form_owner (owner_id),
  INDEX ix_form_status (status)
);
```

### 2.5 `form_permissions`

```sql
CREATE TABLE form_permissions (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  form_id     BIGINT UNSIGNED NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id     BIGINT UNSIGNED NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(20)   NOT NULL DEFAULT 'viewer',     -- editor|viewer|approver|analyst
  created_at  DATETIME(6)   NOT NULL,
  updated_at  DATETIME(6)   NOT NULL,

  UNIQUE KEY uq_form_permission (form_id, user_id)
);
```

### 2.6 `form_responses`

```sql
CREATE TABLE form_responses (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  form_id          BIGINT UNSIGNED NOT NULL REFERENCES forms(id),
  responder_id     BIGINT UNSIGNED          REFERENCES users(id),   -- null for anonymous
  responder_email  VARCHAR(255),
  payload          JSON,                    -- {field_name: value, ...}
  hidden_fields    JSON,                    -- {field_name: value, ...}
  geo              JSON,                    -- {lat: 12.97, lng: 77.59, address: "..."}
  status           VARCHAR(20)  DEFAULT 'submitted',  -- submitted|under_review|approved|rejected
  is_draft         TINYINT(1)   DEFAULT 0,
  score            FLOAT,                   -- quiz total score
  max_score        FLOAT,                   -- maximum possible quiz score
  ip_address       VARCHAR(45),
  user_agent       TEXT,
  source_token     VARCHAR(255),            -- distribution tracking token
  submitted_at     DATETIME(6),
  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,

  INDEX ix_resp_form_submitted (form_id, submitted_at),
  INDEX ix_resp_responder (responder_id),
  INDEX ix_resp_status (status),
  INDEX ix_resp_draft (is_draft)
);
```

*Note: For the single-response enforcement, the application checks at submission time:*
```ruby
if form.single_response
  existing = form.form_responses.submitted
               .where(responder_id: current_user.id).exists?
  raise "Already submitted" if existing
end
```

### 2.7 `audit_logs`

```sql
CREATE TABLE audit_logs (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id  BIGINT UNSIGNED NOT NULL REFERENCES organizations(id),
  actor_id         BIGINT UNSIGNED          REFERENCES users(id),   -- null for system events
  event            VARCHAR(100)  NOT NULL,   -- form_created|response_submitted|...
  target_type      VARCHAR(50),              -- Form|FormResponse|User
  target_id        BIGINT UNSIGNED,
  metadata         JSON,                     -- additional context
  ip_address       VARCHAR(45),
  created_at       DATETIME(6)   NOT NULL,

  INDEX ix_audit_org_ts (organization_id, created_at DESC),
  INDEX ix_audit_event (event),
  INDEX ix_audit_target (target_type, target_id)
);
```

### 2.8 `templates`

```sql
CREATE TABLE templates (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id  BIGINT UNSIGNED REFERENCES organizations(id),  -- null = global
  created_by_id    BIGINT UNSIGNED REFERENCES users(id),
  name             VARCHAR(255)  NOT NULL,
  description      TEXT,
  category         VARCHAR(50),             -- hr|sales|support|operations|education|event
  schema           JSON,                    -- SurveyJS JSON schema
  is_global        TINYINT(1)   DEFAULT 0,  -- available to all orgs
  thumbnail_url    TEXT,
  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,

  INDEX ix_template_global (is_global),
  INDEX ix_template_category (category)
);
```

---

## 3. Canonical Form Schema (SurveyJS JSON)

The `forms.schema` column stores the SurveyJS JSON format directly. SurveyJS Creator produces and consumes this format natively. The backend stores and returns it as-is, treating it as an opaque JSON document except for quiz scoring.

### 3.1 Example SurveyJS Schema

```json
{
  "title": "Employee Onboarding",
  "showProgressBar": "top",
  "pages": [
    {
      "name": "page1",
      "title": "Personal Information",
      "elements": [
        {
          "type": "text",
          "name": "full_name",
          "title": "Full Name",
          "isRequired": true,
          "validators": [{ "type": "text", "minLength": 2 }]
        },
        {
          "type": "dropdown",
          "name": "department",
          "title": "Department",
          "isRequired": true,
          "choices": ["HR", "Engineering", "Sales", "Operations", "Finance"]
        },
        {
          "type": "text",
          "name": "employee_id",
          "title": "Employee ID",
          "inputType": "text"
        }
      ]
    },
    {
      "name": "page2",
      "title": "Work Preferences",
      "elements": [
        {
          "type": "radiogroup",
          "name": "work_mode",
          "title": "Preferred Work Mode",
          "choices": ["Remote", "Hybrid", "Office"],
          "isRequired": true
        },
        {
          "type": "comment",
          "name": "additional_notes",
          "title": "Any additional notes?"
        }
      ]
    }
  ]
}
```

### 3.2 Supported SurveyJS Question Types (PRD §7)

| PRD Type | SurveyJS `type` | Notes |
|---|---|---|
| Short answer | `text` | `inputType: "text"` |
| Paragraph | `comment` | Multi-line textarea |
| Rich text | `text` | `inputType: "text"` + RTE plugin |
| Password | `text` | `inputType: "password"` — stored encrypted |
| Single select | `radiogroup` | |
| Multi select | `checkbox` | |
| Dropdown | `dropdown` | |
| Toggle | `boolean` | |
| Date | `text` | `inputType: "date"` |
| Date-time | `text` | `inputType: "datetime-local"` |
| Number | `text` | `inputType: "number"` + validators |
| Rating | `rating` | `rateMin: 1, rateMax: 10` |
| Scale | `rating` | `rateType: "stars"` or custom |
| File upload | `file` | `maxSize`, `acceptedTypes` |
| Signature | `signaturepad` | Via SurveyJS plugin |
| Section | `panel` | Groups questions |
| Image question | `imagepicker` | |
| Matrix grid | `matrix` | `rows[]`, `columns[]` |
| Geo-location | `text` | Custom type with HTML5 Geolocation API |
| @Mention | `text` | Custom type resolved against user directory |
| Hidden field | `html` | `visible: false` in schema; stored in `hidden_fields` |

### 3.3 Hidden Fields Schema

```json
{
  "pages": [...],
  "calculatedValues": [
    { "name": "source", "expression": "", "includeIntoResult": true },
    { "name": "campaign_id", "expression": "", "includeIntoResult": true }
  ]
}
```

Hidden fields are populated from URL parameters on the customer portal before the survey loads.

### 3.4 Quiz Config Schema

```json
{
  "enabled": true,
  "passThreshold": 0.6,
  "feedback": "immediate",
  "answerKey": {
    "q1": { "correct": "Paris", "points": 2, "caseInsensitive": true },
    "q2": { "correct": ["A", "C"], "points": 3 },
    "q3": { "manual": true, "points": 5 }
  }
}
```

---

## 4. API Specification

### 4.1 API Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Authenticate; receive JWT |
| POST | `/auth/register` | public | Register (domain-matched to org) |
| DELETE | `/auth/logout` | JWT | Revoke token (invalidate jti) |
| GET | `/auth/me` | JWT | Current user info |
| GET | `/forms` | JWT | List org forms (paginated) |
| POST | `/forms` | JWT | Create draft form |
| GET | `/forms/:id` | JWT | Fetch form + schema |
| PATCH | `/forms/:id` | JWT | Update schema/settings |
| DELETE | `/forms/:id` | JWT | Delete form |
| POST | `/forms/:id/publish` | JWT | Publish form |
| POST | `/forms/:id/copy` | JWT | Duplicate into new draft |
| GET | `/forms/:id/responses_summary` | JWT | Count + completion rate |
| GET | `/forms/:id/analytics` | JWT | Full analytics data |
| GET | `/forms/:form_id/responses` | JWT | List submitted responses |
| GET | `/forms/:form_id/responses/export` | JWT | CSV download |
| GET | `/public/forms/:token` | **public** | Fetch published form for respondent |
| POST | `/public/forms/:token/responses` | **public** | Submit response (or save draft) |
| PATCH | `/public/forms/:token/responses/:id` | **public** | Update draft |
| GET | `/analytics/dashboard` | JWT | Org-level dashboard metrics |
| GET | `/users` | JWT (admin) | List org users |
| POST | `/users` | JWT (admin) | Create user |
| GET/PATCH/DELETE | `/users/:id` | JWT (admin/self) | CRUD on user |
| GET | `/templates` | JWT | List available templates |
| GET | `/templates/:id` | JWT | Fetch template schema |
| POST | `/templates/:id/use` | JWT | Create form from template |
| GET | `/organization` | JWT | Fetch org settings |
| PATCH | `/organization` | JWT (admin) | Update org settings |
| GET | `/admin/audit_logs` | JWT (admin) | Query audit trail |

### 4.2 Request / Response Contracts

#### `POST /auth/login`

```
Request:
{
  "email":    "admin@rediff.com",
  "password": "Admin@1234"
}

Response 200:
{
  "token": "eyJhbGci...",
  "user": {
    "id": 1,
    "email": "admin@rediff.com",
    "name": "Org Admin",
    "role": "org_admin",
    "department": null,
    "organization": {
      "id": 1,
      "name": "Rediff Communications",
      "branding": {
        "logo_url": null,
        "primary_color": "#d62929",
        "accent_color": "#f5a623",
        "font": "Inter"
      }
    }
  }
}

Response 401:  { "error": "Invalid credentials" }
Response 403:  { "error": "Account is suspended" }
```

#### `POST /forms`

```
Request:
{
  "form": {
    "title": "Employee Feedback Q2",
    "description": "Quarterly feedback form",
    "schema": { /* SurveyJS JSON */ },
    "is_quiz": false,
    "require_login": true,
    "single_response": true,
    "response_cap": 500,
    "expires_at": "2026-09-30T23:59:59Z",
    "confirmation_message": "Thank you! Your response has been recorded.",
    "branding": { "primary_color": "#d62929" }
  }
}

Response 201:
{
  "form": {
    "id": 12,
    "title": "Employee Feedback Q2",
    "status": "draft",
    "public_token": "abc123xyz",
    "owner": { "id": 1, "name": "Org Admin" },
    "response_count": 0,
    "is_quiz": false,
    "schema": { /* SurveyJS JSON */ },
    "settings": {
      "require_login": true,
      "single_response": true,
      "response_cap": 500,
      "expires_at": "2026-09-30T23:59:59.000Z",
      "confirmation_message": "Thank you! Your response has been recorded."
    },
    "created_at": "2026-06-03T10:00:00.000Z",
    "updated_at": "2026-06-03T10:00:00.000Z"
  }
}
```

#### `GET /public/forms/:token`

```
Request: GET /api/v1/public/forms/abc123xyz
Auth: none (Bearer token optional — if present, identity attached to response)

Response 200:
{
  "form": {
    "id": 12,
    "title": "Employee Feedback Q2",
    "description": "...",
    "schema": { /* SurveyJS JSON — rendered by customer portal */ },
    "branding": {
      "logo_url": "https://...",
      "primary_color": "#d62929",
      "accent_color": "#f5a623",
      "font": "Inter"
    },
    "settings": {
      "show_progress_bar": true,
      "confirmation_message": "Thank you!",
      "redirect_url": null,
      "require_login": false,
      "single_response": false
    }
  }
}

Response 404:  { "error": "Form not found" }
Response 410:  { "error": "This form is not accepting responses" }
```

#### `POST /public/forms/:token/responses`

```
Request (draft / autosave):
{
  "payload":      { "full_name": "Jane", "department": "HR" },
  "hidden_fields": { "source": "email-campaign-1" },
  "geo":          { "lat": 12.97, "lng": 77.59 },
  "is_draft":     true
}

Request (final submit):
{
  "payload":      { "full_name": "Jane Doe", "department": "HR", "work_mode": "Hybrid" },
  "hidden_fields": { "source": "email-campaign-1" },
  "is_draft":     false
}

Response 201:
{
  "response": {
    "id": 98,
    "form_id": 12,
    "is_draft": false,
    "score": null,
    "max_score": null,
    "submitted_at": "2026-06-03T10:15:00.000Z"
  }
}

Response 410:  { "error": "This form is not accepting responses" }
Response 422:  { "error": "Validation failed", "details": ["..."] }
```

#### `GET /forms/:id/analytics`

```
Response 200:
{
  "form_id": 12,
  "overview": {
    "total_responses": 342,
    "completion_rate": 87.5,
    "avg_duration_seconds": null,
    "today": 12,
    "this_week": 78
  },
  "trend": [
    { "date": "2026-05-01", "count": 23 },
    { "date": "2026-05-02", "count": 31 }
  ],
  "question_breakdown": [
    {
      "question": "Preferred Work Mode",
      "name": "work_mode",
      "type": "radiogroup",
      "choices": [
        { "value": "Remote", "count": 189 },
        { "value": "Hybrid",  "count": 102 },
        { "value": "Office",  "count": 51 }
      ]
    }
  ],
  "quiz": null
}
```

---

## 5. Rails Model Design

### 5.1 Model Hierarchy

```
ApplicationRecord
  ├── Organization
  │     has_many :users
  │     has_many :forms
  │     has_many :templates
  │     has_many :audit_logs
  │
  ├── User
  │     belongs_to :organization
  │     belongs_to :manager, class_name: 'User', optional: true
  │     has_many :owned_forms, class_name: 'Form', foreign_key: :owner_id
  │     has_many :form_permissions
  │     has_many :form_responses, foreign_key: :responder_id
  │     has_secure_password  (BCrypt)
  │
  ├── Form
  │     belongs_to :organization
  │     belongs_to :owner, class_name: 'User'
  │     has_many :form_permissions
  │     has_many :form_responses
  │     after_initialize :set_json_defaults   (schema, branding, etc.)
  │     before_create    :generate_public_token
  │     scope :published, :active, :accepting_responses?
  │
  ├── FormPermission
  │     belongs_to :form
  │     belongs_to :user
  │
  ├── FormResponse
  │     belongs_to :form
  │     belongs_to :responder, class_name: 'User', optional: true
  │     scope :submitted, :drafts
  │     def calculate_score!(answer_key)
  │     before_save :set_submitted_at
  │
  ├── AuditLog
  │     belongs_to :organization
  │     belongs_to :actor, class_name: 'User', optional: true
  │     def self.record(actor:, org:, event:, target: nil, metadata: {}, ip: nil)
  │
  └── Template
        belongs_to :organization, optional: true
        belongs_to :created_by, class_name: 'User', optional: true
        scope :global, :for_org
```

### 5.2 Key Model Methods

#### `Form#accepting_responses?`

```ruby
def accepting_responses?
  return false unless status == 'published'
  return false if expires_at.present?  && expires_at < Time.current
  return false if opens_at.present?   && opens_at > Time.current
  return false if response_cap.present? &&
                  form_responses.submitted.count >= response_cap
  true
end
```

#### `Form#duplicate!(new_owner)`

```ruby
def duplicate!(new_owner)
  new_form = dup
  new_form.title        = "Copy of #{title}"
  new_form.status       = 'draft'
  new_form.public_token = nil   # regenerated by before_create
  new_form.owner        = new_owner
  new_form.save!
  new_form
end
```

#### `FormResponse#calculate_score!(answer_key)`

```ruby
def calculate_score!(answer_key)
  return unless form.quiz?
  total  = 0.0
  earned = 0.0
  answer_key.each do |question_name, config|
    total += config['points'].to_f
    answer = payload[question_name]
    if config['manual']
      # Left for reviewer; handled separately
    elsif config['correct'].is_a?(Array)
      earned += config['points'].to_f if Array(answer).sort == config['correct'].sort
    else
      expected = config['caseInsensitive'] ? config['correct'].to_s.downcase : config['correct'].to_s
      given    = config['caseInsensitive'] ? answer.to_s.downcase            : answer.to_s
      earned += config['points'].to_f if given == expected
    end
  end
  update!(score: earned, max_score: total)
end
```

### 5.3 Controller Pattern

All API controllers follow this layered pattern:

```ruby
module Api
  module V1
    class FormsController < ApplicationController
      before_action :authenticate_user!     # decodes JWT, sets current_user
      before_action :set_form, only: [...]

      def index
        authorize Form                       # Pundit policy check
        forms = policy_scope(Form)           # scoped to what current_user can see
                  .order(updated_at: :desc)
                  .page(params[:page]).per(20)
        render json: { forms: forms.map { |f| form_json(f) },
                       meta: pagination_meta(forms) }
      end

      def create
        authorize Form                       # can current_user create forms?
        form = current_user.organization.forms.build(form_params)
        form.owner = current_user
        form.save!
        AuditLog.record(actor: current_user, org: current_user.organization,
                        event: 'form_created', target: form, ip: request.remote_ip)
        render json: { form: form_json(form, full: true) }, status: :created
      end
      # ...
    end
  end
end
```

---

## 6. Service Layer Design

### 6.1 `JwtService`

```ruby
class JwtService
  ALGORITHM        = 'HS256'
  ACCESS_TOKEN_TTL = 24.hours

  def self.encode(payload, ttl: ACCESS_TOKEN_TTL)
    payload = payload.merge(
      exp: (Time.current + ttl).to_i,
      iat: Time.current.to_i
    )
    JWT.encode(payload, secret, ALGORITHM)
  end

  def self.decode(token)
    decoded = JWT.decode(token, secret, true, { algorithm: ALGORITHM })
    HashWithIndifferentAccess.new(decoded.first)
  rescue JWT::ExpiredSignature => e
    raise AuthenticationError, 'Token expired'
  rescue JWT::DecodeError
    raise AuthenticationError, 'Invalid token'
  end

  def self.issue_for(user)
    encode({ user_id:  user.id,
             org_id:   user.organization_id,
             role:     user.role,
             jti:      user.jti })
  end

  def self.secret
    ENV.fetch('SECRET_KEY_BASE')
  end
end
```

Token validation in `ApplicationController`:

```ruby
def authenticate_user!
  header  = request.headers['Authorization']
  raise AuthenticationError, 'No token provided' unless header
  token   = header.split(' ').last
  payload = JwtService.decode(token)
  user    = User.find(payload[:user_id])
  raise AuthenticationError, 'Session revoked' if user.jti != payload[:jti]
  raise AuthenticationError, 'Account inactive' unless user.status == 'active'
  @current_user = user
end
```

### 6.2 `CsvExportService`

```ruby
class CsvExportService
  def self.export(responses, schema)
    questions = extract_questions(schema)
    headers   = ['Response ID', 'Submitted At', 'Respondent Email'] +
                questions.map { |q| q[:title] }
    CSV.generate(headers: true) do |csv|
      csv << headers
      responses.each do |r|
        row = [r.id, r.submitted_at&.iso8601, r.responder_email]
        questions.each { |q| row << r.payload[q[:name]].to_s }
        csv << row
      end
    end
  end

  def self.extract_questions(schema)
    return [] unless schema.is_a?(Hash)
    (schema['pages'] || [])
      .flat_map { |p| p['elements'] || [] }
      .map { |el| { name: el['name'], title: el['title'] || el['name'] } }
  end
end
```

### 6.3 `SheetsIntegrationService` (V1)

```ruby
class SheetsIntegrationService
  def self.append(form_response)
    form = form_response.form
    return unless form.sheets_capture_enabled? && form.sheets_url.present?

    row  = build_row(form_response, form.schema)
    # Call Rediff Sheets API (idempotent on response_id)
    RediffSheetsClient.append(
      sheet_url:   form.sheets_url,
      row:         row,
      response_id: form_response.id   # for idempotency
    )
  end

  def self.build_row(response, schema)
    questions = CsvExportService.extract_questions(schema)
    [response.id, response.submitted_at&.iso8601, response.responder_email] +
      questions.map { |q| response.payload[q[:name]].to_s }
  end
end
```

### 6.4 `PdfGenerationService` (V2)

```ruby
class PdfGenerationService
  def self.generate_receipt(form_response)
    form = form_response.form
    Prawn::Document.generate(tmp_path) do |pdf|
      pdf.image form.organization.logo_url, width: 100 if form.organization.logo_url
      pdf.text "Response Receipt", size: 20, style: :bold
      pdf.text "Form: #{form.title}"
      pdf.text "Submitted: #{form_response.submitted_at}"
      pdf.move_down 20

      form_response.payload.each do |field_name, value|
        question = find_question(form.schema, field_name)
        pdf.text "#{question&.fetch('title', field_name)}: #{value}"
      end
    end
    store_in_object_storage(tmp_path, form_response)
  end
end
```

---

## 7. Policy Layer (RBAC)

Pundit policies enforce the PRD §6 permission matrix. Each policy class has public methods (`index?`, `show?`, `create?`, etc.) and a `Scope` class.

### 7.1 `FormPolicy`

```ruby
class FormPolicy < ApplicationPolicy
  def index?          = true
  def show?           = owner_or_permitted? || admin?
  def create?         = user.can_create_forms?
  def update?         = owner_or_editor? || admin?
  def destroy?        = owner? || admin?
  def view_responses? = owner_or_permitted? || admin?

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user.super_admin? || user.org_admin?
        scope.where(organization_id: user.organization_id)
      else
        owned  = scope.where(owner_id: user.id)
        shared = scope.joins(:form_permissions)
                      .where(form_permissions: { user_id: user.id })
        scope.where(id: owned.select(:id).or(shared.select(:id)))
      end
    end
  end

  private

  def owner?
    record.owner_id == user.id
  end

  def admin?
    user.super_admin? || user.org_admin?
  end

  def permitted_role
    record.form_permissions.find_by(user_id: user.id)&.role
  end

  def owner_or_permitted?
    owner? || permitted_role.present?
  end

  def owner_or_editor?
    owner? || permitted_role == 'editor' || admin?
  end
end
```

### 7.2 `User#can_create_forms?`

```ruby
def can_create_forms?
  %w[super_admin org_admin form_owner].include?(role)
end
```

---

## 8. Form Logic Engine

SurveyJS handles client-side conditional logic natively through its `visibleIf`, `enableIf`, and `requiredIf` expression syntax. The server re-evaluates logic server-side on submit to prevent client-side bypass.

### 8.1 SurveyJS Logic Syntax (PRD §8)

```json
{
  "elements": [
    {
      "type": "radiogroup",
      "name": "satisfaction",
      "title": "Overall satisfaction?",
      "choices": ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied"]
    },
    {
      "type": "comment",
      "name": "improvement_suggestions",
      "title": "What can we improve?",
      "visibleIf": "{satisfaction} = 'Dissatisfied' or {satisfaction} = 'Neutral'",
      "isRequired": true
    },
    {
      "type": "text",
      "name": "hidden_campaign",
      "visible": false,
      "defaultValue": ""
    }
  ]
}
```

### 8.2 Server-Side Logic Validation

```ruby
class FormLogicValidator
  # Validates that all visibleIf/enableIf expressions reference existing field names
  def self.validate(schema)
    field_names  = extract_field_names(schema)
    errors       = []
    all_elements = extract_all_elements(schema)

    all_elements.each do |el|
      ['visibleIf', 'enableIf', 'requiredIf'].each do |prop|
        next unless el[prop]
        referenced = extract_referenced_fields(el[prop])
        referenced.each do |ref|
          unless field_names.include?(ref)
            errors << "Field '#{el['name']}' references unknown field '#{ref}' in #{prop}"
          end
        end
      end
    end
    errors
  end
end
```

---

## 9. Quiz Scoring Algorithm

### 9.1 Quiz Config Structure

```json
{
  "enabled": true,
  "passThreshold": 0.6,
  "feedback": "immediate",
  "answerKey": {
    "capital_of_france": {
      "correct": "Paris",
      "points": 2,
      "caseInsensitive": true,
      "explanation": "Paris has been the capital since 987 AD."
    },
    "select_planets": {
      "correct": ["Earth", "Mars"],
      "points": 3
    },
    "essay_question": {
      "manual": true,
      "points": 10
    }
  }
}
```

### 9.2 Scoring Algorithm (Ruby)

```ruby
def calculate_score!(answer_key)
  return unless form.is_quiz && !is_draft

  total_points  = 0.0
  earned_points = 0.0
  score_detail  = {}

  answer_key.each do |field_name, config|
    pts = config['points'].to_f
    total_points += pts

    if config['manual']
      score_detail[field_name] = 'pending'
      next
    end

    answer   = payload[field_name]
    correct  = config['correct']

    is_correct = if correct.is_a?(Array)
      Array(answer).map(&:to_s).sort == correct.map(&:to_s).sort
    else
      given    = config['caseInsensitive'] ? answer.to_s.downcase : answer.to_s
      expected = config['caseInsensitive'] ? correct.to_s.downcase : correct.to_s
      given == expected
    end

    earned_points += pts if is_correct
    score_detail[field_name] = is_correct
  end

  update!(
    score:     earned_points,
    max_score: total_points
  )
end
```

### 9.3 Analytics Aggregation for Quizzes

```ruby
def quiz_stats(responses)
  scored = responses.where.not(score: nil)
  return {} if scored.empty?

  scores = scored.pluck(:score)
  max    = scored.first.max_score.to_f

  {
    avg_score:          (scores.sum / scores.size).round(2),
    max_possible:       max,
    pass_rate:          scored.where('score >= ?', max * 0.6).count.to_f / scored.count,
    score_distribution: bucket_scores(scores, max)
  }
end

def bucket_scores(scores, max)
  return [] if max.zero?
  buckets = Array.new(5, 0)
  scores.each do |s|
    idx = [(s / max * 4).floor, 4].min
    buckets[idx] += 1
  end
  buckets.each_with_index.map do |count, i|
    { range: "#{i * 20}–#{(i + 1) * 20}%", count: count }
  end
end
```

---

## 10. Authentication & JWT Design

### 10.1 JWT Payload Structure

```json
{
  "user_id":  1,
  "org_id":   1,
  "role":     "org_admin",
  "jti":      "8017-2feb-eb04-4c4c",
  "exp":      1780492446,
  "iat":      1780406046
}
```

### 10.2 Token Revocation

Each user row has a `jti` (JWT ID) column. On logout:
```ruby
def logout
  current_user.update!(jti: SecureRandom.uuid)  # new jti invalidates all current tokens
  head :no_content
end
```

On every authenticated request, `authenticate_user!` verifies `payload[:jti] == user.jti`.

### 10.3 MFA Flow (V2)

```
Step 1:  POST /auth/login  → returns partial_token (mfa_pending: true)
Step 2:  POST /auth/mfa/challenge { factor: "totp" | "email_otp" | "sms_otp" }
           - TOTP:     verify ROTP.new(user.mfa_secret).verify(code, drift_behind: 30)
           - email_otp: generate 6-digit code, store in Redis 5min, send via Rediff Email
           - sms_otp:   similar to email_otp, send via SMS gateway
Step 3:  POST /auth/mfa/verify { code }
           → on success: issue full JWT
```

### 10.4 SSO Prefill (V1)

When a form has `prefill` configuration in its schema, the Form Service resolves fields from the authenticated user's identity:

```ruby
def resolve_prefill(schema, user)
  prefill_map = {
    'sso.name'        => user.name,
    'sso.email'       => user.email,
    'sso.department'  => user.department,
    'sso.employee_id' => user.employee_id,
    'sso.manager'     => user.manager&.name
  }

  schema['pages']&.each do |page|
    page['elements']&.each do |el|
      next unless el['prefill']&.fetch('from', nil)
      source = el['prefill']['from']
      value  = prefill_map[source]
      next unless value
      el['defaultValue'] = value
      el['readOnly'] = !el['prefill']['editable'] if el['prefill'].key?('editable')
    end
  end
  schema
end
```

---

## 11. Background Job Design (Sidekiq)

### 11.1 Queue Configuration

```yaml
# config/sidekiq.yml
:concurrency: 10
:queues:
  - [critical, 3]    # MFA OTP delivery
  - [default, 2]     # Form invites, notifications
  - [low, 1]         # Sheets sync, PDF generation, analytics rollups
```

### 11.2 `SheetsAppendWorker`

```ruby
class SheetsAppendWorker
  include Sidekiq::Worker
  sidekiq_options queue: :low, retry: 5

  def perform(form_response_id)
    response = FormResponse.find(form_response_id)
    SheetsIntegrationService.append(response)
  rescue SheetsConnector::RateLimitError => e
    # Sidekiq will retry with exponential backoff
    raise e
  rescue SheetsConnector::NotFoundError
    # Sheet deleted — disable capture for this form
    response.form.update!(sheets_capture_enabled: false)
  end
end
```

Triggered after each successful submission:
```ruby
SheetsAppendWorker.perform_async(response.id) if form.sheets_capture_enabled?
```

### 11.3 `PdfGenWorker`

```ruby
class PdfGenWorker
  include Sidekiq::Worker
  sidekiq_options queue: :low, retry: 3

  def perform(form_response_id)
    response = FormResponse.find(form_response_id)
    storage_key = PdfGenerationService.generate_receipt(response)
    # Store storage_key reference on response or notification
    response.update!(receipt_storage_key: storage_key)
  end
end
```

### 11.4 `EmailInviteWorker`

```ruby
class EmailInviteWorker
  include Sidekiq::Worker
  sidekiq_options queue: :default, retry: 3

  def perform(form_id)
    form     = Form.find(form_id)
    audience = form.audience || {}
    emails   = resolve_audience_emails(form, audience)

    emails.each do |email|
      FormMailer.invite(form, email).deliver_now
    end
  end

  private

  def resolve_audience_emails(form, audience)
    case audience['type']
    when 'restricted'
      # Resolve user IDs and group memberships
      user_emails  = User.where(id: audience['users']).pluck(:email)
      group_emails = resolve_group_emails(form.organization, audience['groups'])
      (user_emails + group_emails).uniq
    else
      # open — no email invite; link sharing only
      []
    end
  end
end
```

---

## 12. Frontend Component Design

### 12.1 Admin Portal Component Tree

```
App
└── AuthProvider (context: user, token, login, logout)
    └── BrowserRouter
        ├── /login         → Login
        └── PrivateRoute → Layout
            ├── Sidebar (nav, user info, logout)
            └── [outlet]
                ├── /                → Dashboard
                │     ├── StatCard (×4)
                │     ├── RecentFormsList
                │     └── TopFormsChart (Recharts BarChart)
                │
                ├── /forms           → FormsList
                │     └── DataTable with action buttons
                │
                ├── /forms/new       → FormBuilder
                │   /forms/:id/edit  → FormBuilder
                │     ├── BuilderToolbar (save, publish, settings, templates)
                │     ├── SurveyCreatorComponent (SurveyJS)
                │     ├── SettingsPanel (slide-over)
                │     └── TemplatePickerModal
                │
                ├── /forms/:id/responses → Responses
                │     ├── DataTable
                │     └── ResponseDetailModal
                │
                ├── /forms/:id/analytics → Analytics
                │     ├── StatCard (×4)
                │     ├── TrendChart (Recharts LineChart)
                │     ├── QuestionBreakdown (PieChart / BarChart)
                │     └── QuizStatsCard
                │
                ├── /users           → Users (admin only)
                │     ├── DataTable
                │     └── UserFormModal
                │
                └── /organization    → Organization (admin only)
                      ├── GeneralSection
                      ├── BrandingSection (color pickers, logo)
                      ├── SecuritySection (MFA toggle)
                      └── LocalizationSection
```

### 12.2 Customer Portal Component Tree

```
App
└── AuthProvider (context: user, token, login, logout)
    └── BrowserRouter
        ├── /          → Home
        ├── /login     → Login (redirects to ?from= after success)
        ├── /f/:token  → FormViewer
        │     ├── form-header (logo + "signed in as" badge)
        │     ├── Survey (SurveyJS — schema from API)
        │     │     onValueChanged → debounced autosave (2s)
        │     │     onComplete     → POST /public/forms/:token/responses
        │     └── loading-page | error-page
        ├── /thank-you → ThankYou (custom message + branding)
        └── *          → NotFound
```

### 12.3 API Client Design

```typescript
// admin-portal/src/api/client.ts
const client = axios.create({ baseURL: process.env.REACT_APP_API_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('rforms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expired or revoked — force logout
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
```

---

## 13. State Machines

### 13.1 Form Lifecycle

```
                  ┌─────────────────────────────────────────────┐
                  │                                             │
   Create         ▼    Publish       Close        Archive      │
  ───────► [ draft ] ──────────► [ published ] ──────────► [ closed ] ──► [ archived ]
              ▲  │                                │
              │  │ Edit (PATCH)                   │ Re-open (→ published)
              └──┘                                └──────────────────────────────
```

| State | Can edit? | Accepts responses? | Can be published? |
|---|---|---|---|
| `draft` | ✓ | ✗ | ✓ |
| `published` | ✓ (schema edits) | ✓ | — (already published) |
| `closed` | ✗ | ✗ | ✓ (re-open) |
| `archived` | ✗ | ✗ | ✗ |

### 13.2 Form Response Lifecycle

```
                autosave PATCH         submit POST        approve/reject
   ─────────► [ is_draft: true ] ────────────► [ submitted ] ──────────────► [ approved ]
                                                     │                              │
                                               approval                        [ rejected ]
                                               enabled?
                                                  │
                                                  ▼
                                           [ under_review ]
```

### 13.3 Approval Task State Machine

```
   create task           assign           decide
  ────────────► [ submitted ] ──────► [ under_review ] ──────► [ approved ]
                                                                      │
                                            │ reject                  │
                                            ▼                         │
                                       [ rejected ]                   │
                                                                      ▼
                                                               [ closed ]
```

---

## 14. Error Handling

### 14.1 HTTP Error Map

| HTTP Code | Scenario in RForms | Response Body |
|---|---|---|
| 400 | Malformed request JSON | `{ "error": "Bad request" }` |
| 401 | Missing/expired/revoked JWT | `{ "error": "Token expired" }` |
| 403 | Pundit authorization failure | `{ "error": "Forbidden" }` |
| 404 | Record not found (within org scope) | `{ "error": "Not found" }` |
| 410 | Form expired / closed / cap reached | `{ "error": "This form is not accepting responses" }` |
| 422 | Validation failure | `{ "error": "...", "details": ["field: message"] }` |
| 429 | Rate limit exceeded (V1) | `{ "error": "Too many requests" }` |
| 500 | Unhandled server error | `{ "error": "Internal server error" }` |

### 14.2 Global Error Handlers in ApplicationController

```ruby
rescue_from Pundit::NotAuthorizedError do
  render json: { error: 'Forbidden' }, status: :forbidden
end

rescue_from AuthenticationError do |e|
  render json: { error: e.message }, status: :unauthorized
end

rescue_from ActiveRecord::RecordNotFound do
  render json: { error: 'Not found' }, status: :not_found
end

rescue_from ActiveRecord::RecordInvalid do |e|
  render json: { error: e.message, details: e.record.errors.full_messages },
         status: :unprocessable_entity
end
```

### 14.3 Sidekiq Error Handling

```ruby
# Dead-letter after 5 retries
sidekiq_options retry: 5, dead: true

# Custom retry backoff
sidekiq_retry_in do |count|
  count * 60   # 1min, 2min, 3min, 4min, 5min
end

# Alert on dead job
Sidekiq.configure_server do |config|
  config.death_handlers << ->(job, _ex) do
    AlertingService.notify("Dead job: #{job['class']} args=#{job['args']}")
  end
end
```

---

## 15. Caching Design

### 15.1 Redis Key Schema

| Key Pattern | Content | TTL | Set by | Invalidated by |
|---|---|---|---|---|
| `form:schema:{id}` | Published form JSON schema | 24h | `POST /forms/:id/publish` | Next publish |
| `org:branding:{id}` | Org branding hash | 1h | `PATCH /organization` | Next update |
| `rate:login:{ip}` | Login attempt count | 1min | `POST /auth/login` | TTL expiry |
| `rate:submit:{ip}` | Response submission count | 1min | `POST /public/.../responses` | TTL expiry |
| `mfa:otp:{user_id}` | OTP code for email/SMS MFA | 5min | `POST /auth/mfa/challenge` | Verify or expiry |

### 15.2 Cache-Aside Pattern for Form Schema

```ruby
def fetch_published_schema(form_id)
  cache_key = "form:schema:#{form_id}"
  cached    = Redis.current.get(cache_key)
  return JSON.parse(cached) if cached

  form   = Form.find(form_id)
  schema = form.schema
  Redis.current.setex(cache_key, 24.hours.to_i, schema.to_json)
  schema
end

# Invalidation on publish:
def publish
  @form.update!(status: 'published')
  Redis.current.del("form:schema:#{@form.id}")  # force fresh cache on next load
end
```

---

## 16. Reliability & Concurrency

### 16.1 Single-Response Enforcement

```ruby
# ResponsesController / PublicResponsesController
def enforce_single_response!
  return unless form.single_response
  return unless current_user_if_any   # anonymous = no single-response enforcement

  if form.form_responses.submitted.where(responder_id: current_user.id).exists?
    render json: { error: 'You have already submitted a response to this form.' },
           status: :conflict
  end
end
```

### 16.2 Response Cap Enforcement

```ruby
def enforce_response_cap!
  return unless form.response_cap

  # Atomic check using MySQL row lock (SELECT FOR UPDATE) to prevent race condition
  count = form.form_responses.submitted.lock.count
  if count >= form.response_cap
    render json: { error: 'This form has reached its response limit.' }, status: :conflict
  end
end
```

### 16.3 Idempotent Draft Saves

The autosave endpoint uses upsert semantics:

```ruby
# If draft already exists for this user+form → update it
# If not → create new draft
def create_or_update_draft(form, user, payload, hidden_fields)
  draft = if user
    form.form_responses.drafts.find_by(responder_id: user.id)
  else
    nil   # anonymous: create new draft per session (client tracks draft_id)
  end

  if draft
    draft.update!(payload: payload, hidden_fields: hidden_fields)
    draft
  else
    form.form_responses.create!(
      payload:       payload,
      hidden_fields: hidden_fields,
      responder:     user,
      is_draft:      true
    )
  end
end
```

### 16.4 Optimistic Concurrency for Form Edits

When multiple editors collaborate (PRD §15), the last write wins by default. For V1+, add `lock_version`:

```ruby
# Migration: add_column :forms, :lock_version, :integer, default: 0

# Client includes lock_version in PATCH:
# PATCH /forms/:id  { form: { title: "...", lock_version: 3 } }

# Rails raises ActiveRecord::StaleObjectError if version mismatches
# → 409 Conflict response with { "error": "Form was modified by another editor. Please reload." }
```

---

*End of Low-Level Design. This LLD, together with the HLD, constitutes the complete engineering specification for RForms per PRD v2.0.*
