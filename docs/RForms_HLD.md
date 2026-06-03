# Rediff Enterprise Forms (RForms)
## High-Level Design (HLD)

**Document type:** Architecture / HLD &nbsp;|&nbsp; **Version:** 1.0 &nbsp;|&nbsp; **Status:** Approved  
**Derived from:** RForms PRD v2.0  
**Companion:** RForms LLD v1.0

---

## Table of Contents

1. [Introduction & Scope](#1-introduction--scope)
2. [Architectural Goals & Constraints](#2-architectural-goals--constraints)
3. [System Context](#3-system-context)
4. [Technology Stack](#4-technology-stack)
5. [Logical Architecture](#5-logical-architecture)
6. [Component Responsibilities](#6-component-responsibilities)
7. [Data Architecture](#7-data-architecture)
8. [Key Runtime Flows](#8-key-runtime-flows)
9. [Security Architecture](#9-security-architecture)
10. [Scalability, Availability & Performance](#10-scalability-availability--performance)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Observability & Cross-Cutting Concerns](#12-observability--cross-cutting-concerns)
13. [Release Phasing](#13-release-phasing)
14. [Risks & Open Questions](#14-risks--open-questions)

---

## 1. Introduction & Scope

RForms is an enterprise-grade form platform for Rediff Enterprise Email's 50,000+ enterprise clients — a Google Forms equivalent deeply integrated with Rediff's identity, email, and collaboration ecosystem.

### 1.1 In Scope

- Logical system decomposition and technology choices
- High-level data architecture and multi-tenancy model
- Principal end-to-end flows: authoring, submission, autosave, approval workflow, analytics, document generation, AI form generation
- Security, scalability, availability and deployment strategy

### 1.2 Out of Scope

- Form versioning — explicitly excluded per PRD §36; "Make a copy" covers branching
- Detailed DDL, per-endpoint contracts, class diagrams — these are in the companion LLD

### 1.3 Key Design Assumptions

| # | Assumption | Basis |
|---|---|---|
| A1 | Backend is Ruby on Rails 8 (API mode) with MySQL 8 | Project tech spec; aligns with Rediff's existing RoR expertise |
| A2 | Dynamic form schemas and response payloads are stored as JSON columns | Forms are inherently variable-schema; JSON avoids schema migrations per form |
| A3 | MVP is a modular Rails monolith; V2 services can be extracted as load demands | 50k clients, 10M responses/day is achievable with a well-structured monolith + read replicas |
| A4 | Frontend uses SurveyJS Creator (admin) and SurveyJS (customer) on React/TypeScript | Project tech spec; SurveyJS provides proven drag-and-drop form building |
| A5 | Tenancy is logical: shared cluster, per-organization row-level scoping | PRD §19 tenant isolation; physical isolation is an enterprise add-on |
| A6 | Background jobs run via Sidekiq/Redis; async fan-out for email, Sheets sync, PDF generation | PRD §37 queue requirement |

---

## 2. Architectural Goals & Constraints

| Goal | PRD Target | Architectural Response |
|---|---|---|
| **Performance** | Form load < 2 seconds | Redis-cached form schemas; CDN-served SPA; read replicas; thin submission path |
| **Scale** | 10M responses / day | Stateless horizontally-scaled Rails instances; async fan-out via Sidekiq; partitioned response storage |
| **Availability** | 99.9% uptime | Multi-instance Kubernetes; no single point of failure; graceful degradation of async features |
| **Security** | TLS, AES-256, SOC2 alignment, tenant isolation | JWT auth; encryption in transit and at rest; field-level encryption for passwords; full audit trail |
| **Accessibility** | WCAG 2.1 AA | Enforced in SPA component library; contrast validation in theming |
| **Identity** | SSO prefill + MFA | Auth controller brokering Rediff SSO; TOTP/OTP MFA factors |
| **Extensibility** | Quizzes, branding, i18n, docs, AI | Feature-flagged modules within the Rails service layer; schema-driven form model |

---

## 3. System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ACTORS                                           │
│                                                                         │
│  [Workspace Admin]  [Form Creator]  [Respondent]  [Approver] [Analyst] │
└──────────┬──────────────┬───────────────┬──────────────┬────────┬──────┘
           │              │               │              │        │
           ▼              ▼               ▼              ▼        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     RFORMS PLATFORM                                      │
│                                                                         │
│   ┌──────────────────┐          ┌───────────────────────────────────┐  │
│   │  Admin Portal     │          │        Customer Portal            │  │
│   │  (React +         │          │  (React + SurveyJS)               │  │
│   │  SurveyJS Creator)│          │  Form fill / Submit / Thank-you   │  │
│   └────────┬─────────┘          └──────────────┬────────────────────┘  │
│            │                                    │                        │
│            └──────────────┬─────────────────────┘                       │
│                           ▼                                             │
│              ┌────────────────────────┐                                 │
│              │   Nginx Reverse Proxy  │                                 │
│              └────────────┬───────────┘                                 │
│                           ▼                                             │
│              ┌────────────────────────┐                                 │
│              │   Rails API Backend    │                                 │
│              │  (Ruby on Rails 8)     │                                 │
│              └──┬───────────────┬─────┘                                 │
│                 │               │                                       │
│         ┌───────▼───┐    ┌──────▼────┐                                 │
│         │  MySQL 8  │    │  Sidekiq  │                                 │
│         │ (Primary) │    │  Worker   │                                 │
│         └───────────┘    └──────┬────┘                                 │
│                                 │                                       │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
           ┌──────────────────────┼─────────────────────┐
           ▼                      ▼                      ▼
  [Rediff SSO / Identity]  [Rediff Email]     [Rediff Sheets]
  [MFA / Directory]        [SMTP / API]       [Spreadsheet API]
           │                                             │
           ▼                                             ▼
  [LLM / AI Service]                        [PDF Render Service]
  [Object Storage]
```

### 3.1 Actors

| Actor | Primary Intent | Key Interactions |
|---|---|---|
| Workspace Admin | Govern the org | Policies, branding, MFA, languages, Sheets controls, audit logs |
| Form Creator / Owner | Build & distribute | Builder, logic, sharing, settings, responses, analytics, copy |
| Respondent | Submit information | Open form, autosave/resume, upload files, geo/consent, receipt |
| Reviewer / Approver | Decide on submissions | Approve/reject, comment, reassign, SLA-bound tasks |
| Analyst | Understand the data | Dashboards, charts, exports (CSV/Excel/PDF/Sheets) |

### 3.2 External Systems

| System | Role | Coupling |
|---|---|---|
| Rediff SSO / Identity | Authentication, MFA, directory (manager, groups) for prefill & @mentions | Synchronous (login) + periodic directory sync |
| Rediff Enterprise Email | Distribution: invites, personalized links, reminders, notification & receipt delivery | Asynchronous (queued Sidekiq job) |
| Rediff Sheets | Live response capture; append rows on submission; backfill | Asynchronous (Sidekiq event-driven) |
| PDF Render Service | Render filled PDFs / receipts from templates + response data | Asynchronous (Sidekiq on-demand) |
| LLM / AI Service | Generate draft form schemas from prompts or uploaded documents | Synchronous request / async for large jobs |
| Object Storage | Attachments and generated documents | Synchronous read/write via signed URLs |

---

## 4. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Admin Frontend** | React 18 + TypeScript + SurveyJS Creator | Drag-and-drop builder; logic, translation, theme tabs built-in |
| **Customer Frontend** | React 18 + TypeScript + SurveyJS | Proven form renderer; supports all PRD question types |
| **API Backend** | Ruby on Rails 8 (API mode) | PRD project spec; rapid development; strong ecosystem |
| **Primary Database** | MySQL 8 with JSON columns | PRD project spec; ACID compliance; JSON for flexible schema/payload |
| **Background Jobs** | Sidekiq + Redis | Async fan-out for email/Sheets/PDF; retry logic; job monitoring |
| **Cache** | Redis | Form schema cache; rate-limit counters; session/MFA state |
| **Object Storage** | S3-compatible (attachments, generated PDFs) | Signed URLs; no blobs in DB |
| **Reverse Proxy** | Nginx | Routing; SSL termination; static serving; load balancing |
| **Container Platform** | Docker + Docker Compose (→ Kubernetes for production) | Dev/prod parity; independent scaling |
| **Authentication** | JWT (HS256) + Rediff SSO (OAuth2) + MFA (TOTP/OTP) | Stateless; standard; per PRD §4 |
| **Authorization** | Pundit (RBAC policy objects) | Per PRD §6 permission matrix |

---

## 5. Logical Architecture

RForms follows a **modular monolith** approach for MVP/V1, organized in four tiers: client SPAs, an Nginx edge tier, a Rails API layer organized into domain modules, and a shared data/platform tier.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CLIENT TIER                                                               │
│                                                                            │
│  ┌────────────────────────────┐    ┌───────────────────────────────────┐  │
│  │     Admin Portal           │    │      Customer Portal              │  │
│  │  (SurveyJS Creator)        │    │   (SurveyJS + React Router)       │  │
│  │  /dashboard /forms /users  │    │   /f/:token  /login  /thank-you   │  │
│  │  /analytics /organization  │    │                                   │  │
│  └─────────────┬──────────────┘    └──────────────┬────────────────────┘  │
└────────────────┼───────────────────────────────────┼────────────────────────┘
                 │  HTTPS                            │  HTTPS
┌────────────────▼───────────────────────────────────▼────────────────────────┐
│  EDGE TIER — Nginx                                                          │
│  Port 80/443  │  /api/* → backend:3000  │  /admin/* → admin-portal:80       │
│               │  /* → customer-portal:80                                    │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│  RAILS API TIER  (api/v1/*)                                                 │
│                                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Auth Module │  │  Form Module │  │Response Module│  │Analytics Module│ │
│  │  JWT / SSO  │  │  CRUD / copy │  │ Submit/Draft  │  │ Charts/Export  │ │
│  │  MFA / RBAC │  │  Publish     │  │ Auto-save     │  │ Quiz stats     │ │
│  └─────────────┘  └──────────────┘  └──────────────┘  └────────────────┘ │
│                                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ User Module │  │Template Mod. │  │  Org Module   │  │  Audit Module  │ │
│  │ CRUD / roles│  │ Global/Org   │  │ Branding/MFA  │  │ Append-only    │ │
│  └─────────────┘  └──────────────┘  └──────────────┘  └────────────────┘ │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Service Layer                                                        │ │
│  │  JwtService │ CsvExportService │ PdfGenerationService               │ │
│  │  SheetsIntegrationService │ QuizScoringService │ AiFormGenService   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Policy Layer (Pundit)                                                │ │
│  │  FormPolicy │ UserPolicy │ OrganizationPolicy │ AuditLogPolicy       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│  ASYNC TIER — Sidekiq Workers                                               │
│                                                                            │
│  ┌────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │ EmailWorker    │  │ SheetsSync Worker │  │ PdfGenWorker               │ │
│  │ Invite/notify  │  │ Append response   │  │ Receipt / document gen     │ │
│  │ Reminder       │  │ row on submit     │  │ On submit or on demand     │ │
│  └────────────────┘  └──────────────────┘  └────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│  DATA TIER                                                                  │
│                                                                            │
│  ┌──────────────────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│  │  MySQL 8 (Primary)       │    │   Redis       │    │  Object Storage  │ │
│  │  organizations / users   │    │  Form schema  │    │  Attachments     │ │
│  │  forms / form_responses  │    │  cache        │    │  PDF receipts    │ │
│  │  form_permissions        │    │  Sessions     │    │  Media uploads   │ │
│  │  templates / audit_logs  │    │  Sidekiq jobs │    │                  │ │
│  └──────────────────────────┘    └──────────────┘    └──────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Component Responsibilities

### 6.1 Admin Portal (React + SurveyJS Creator)

| Feature | What it does |
|---|---|
| Form Builder | SurveyJS Creator with Logic, Translations, Theme, JSON, Preview tabs |
| Dashboard | Metrics overview, recent forms, charts (Recharts) |
| Forms List | Publish, copy, delete, share link, view responses |
| Responses View | Paginated table, individual response detail, CSV export |
| Analytics | Trend chart, question breakdowns, quiz score distribution |
| User Management | CRUD for org users (admin only) |
| Organization Settings | Branding, MFA policy, Sheets integration (admin only) |

### 6.2 Customer Portal (React + SurveyJS)

| Route | What it does |
|---|---|
| `/` | Landing page with link to admin |
| `/login` | Customer-facing login (same JWT backend); redirects back to form after auth |
| `/f/:token` | SurveyJS form renderer; auto-saves drafts every 2s; applies org branding |
| `/thank-you` | Confirmation page with custom message and org branding |

### 6.3 Rails API Backend

| Module | Controllers | Key responsibilities |
|---|---|---|
| Auth | `AuthController` | Login, logout, register, JWT issue/revoke, MFA challenge/verify |
| Forms | `FormsController` | CRUD, publish, copy, responses summary |
| Public | `PublicFormsController`, `PublicResponsesController` | No-auth form fetch and response submission for customer portal |
| Responses | `ResponsesController` | Authenticated list, export, draft update |
| Analytics | `AnalyticsController` | Dashboard summary, per-form analytics with quiz stats |
| Users | `UsersController` | Org-scoped user CRUD |
| Templates | `TemplatesController` | Global + org templates, use-to-create-form |
| Organization | `OrganizationsController` | Org settings, branding |
| Admin | `Admin::AuditLogsController` | Append-only audit trail query |

### 6.4 Sidekiq Workers (Async)

| Worker | Trigger | Action |
|---|---|---|
| `EmailInviteWorker` | `form.published` event | Send invite emails to form audience via Rediff Email |
| `ReminderWorker` | Scheduled / admin-triggered | Reminder emails to non-respondents |
| `SheetsAppendWorker` | `response.submitted` event | Append response row to linked Rediff Sheet |
| `PdfGenWorker` | `response.submitted` or on demand | Merge response into PDF template, store in object storage |
| `AiFormGenWorker` | `POST /forms/ai-generate` | Prompt LLM, validate schema, return draft |

---

## 7. Data Architecture

### 7.1 Multi-Tenancy Model

Tenancy is **logical** — shared cluster and database. Every tenant-scoped table has an `organization_id` column. All queries are scoped through ActiveRecord associations (`current_user.organization.forms`) making cross-tenant data leaks impossible through normal application code.

```
Organization (Tenant)
     │
     ├── Users (with roles)
     │
     ├── Forms
     │    ├── FormPermissions (per-user/group grants)
     │    ├── FormResponses
     │    └── AuditLogs
     │
     └── Templates (org library)
```

### 7.2 Core Data Domains

| Domain | Tables | Storage Strategy |
|---|---|---|
| Identity & Tenancy | `organizations`, `users` | Relational; `organization_id` on every entity |
| Form Definition | `forms` | Relational shell + `schema` JSON column (SurveyJS JSON format) |
| Permissions | `form_permissions` | Relational; role per user-form pair |
| Responses | `form_responses` | Relational shell + `payload` JSON; `is_draft` flag for autosave |
| Audit | `audit_logs` | Append-only relational; indexed by org + time |
| Templates | `templates` | Relational; `schema` JSON; global or org-scoped |

### 7.3 JSON Column Strategy

SurveyJS form schemas are stored directly in the `schema` JSON column. This means:
- Form structure changes never require database migrations
- The SurveyJS JSON format is the canonical source of truth
- The Rails backend validates and proxies the JSON; it never parses individual questions

### 7.4 Encryption

| Data | Encryption | Where |
|---|---|---|
| Data in transit | TLS 1.3 | Nginx termination |
| Data at rest | AES-256 | MySQL disk encryption |
| Password-type fields | Field-level AES-256 | Rails model before-save callback |
| JWT secrets | Environment variable (SECRET_KEY_BASE) | Never committed to source |

---

## 8. Key Runtime Flows

### 8.1 Form Authoring & Publish

```
Creator (Browser)
  │
  ├── Opens /forms/new → Template picker modal
  │
  ├── SurveyJS Creator ←→ (auto-save PATCH /forms/:id every few seconds)
  │
  ├── Opens Settings Panel → require_login / expiry / response cap / quiz mode
  │
  ├── Click PUBLISH
  │     │
  │     └── POST /forms/:id/publish
  │           │
  │           ├── Rails: validates form (title present, schema valid)
  │           ├── Rails: status = 'published', generates public_token
  │           ├── Rails: caches schema in Redis (keyed form:id)
  │           ├── Rails: writes AuditLog
  │           └── Sidekiq: EmailInviteWorker → Rediff Email → audience invited
  │
  └── Form is live at /f/:public_token
```

### 8.2 Response Submission (Public Form)

```
Respondent (Browser)
  │
  ├── GET /api/v1/public/forms/:token
  │     └── Rails returns schema + branding (no auth required)
  │
  ├── SurveyJS renders form
  │
  ├── [Typing...] → debounce 2s →
  │     POST /api/v1/public/forms/:token/responses  { is_draft: true }
  │     └── Rails UPSERT draft response, returns draft.id
  │
  ├── Click SUBMIT
  │     │
  │     └── POST /api/v1/public/forms/:token/responses  { is_draft: false }
  │           │
  │           ├── Rails: check form.accepting_responses?
  │           │     (published? expired? cap_reached? open_window?)
  │           ├── Rails: persist FormResponse
  │           ├── Rails (if quiz): calculate_score!
  │           ├── Rails: write AuditLog
  │           └── Sidekiq (async, non-blocking):
  │                 ├── SheetsAppendWorker → Rediff Sheets
  │                 └── PdfGenWorker → receipt PDF
  │
  └── Redirect → /thank-you (custom message + branding)
```

### 8.3 Autosave & Resume

```
Authenticated Respondent
  │
  ├── GET /api/v1/public/forms/:token  (JWT token attached by customer portal)
  │     └── Rails: if form.require_login && no auth → 401 → portal redirects to /login
  │
  ├── Fills form → auto-save fires every 2s
  │     PATCH /api/v1/public/forms/:token/responses/:id  { is_draft: true }
  │
  ├── Closes browser / switches device
  │
  └── Returns to /f/:token
        ├── GET /api/v1/public/forms/:token (with auth)
        ├── Rails returns schema + responder's existing draft payload
        └── SurveyJS pre-populates with draft.payload
```

### 8.4 Approval Workflow

```
FormResponse.submit
  └── if form.approval_workflow_enabled:
        Sidekiq: WorkflowJob
          ├── Create ApprovalTask (state: 'under_review')
          ├── Route to approver (configured OR directory-derived manager)
          ├── EmailWorker: notify approver
          └── SLA timer start

Approver
  ├── GET /api/v1/forms/:id/responses → sees 'under_review' responses
  ├── PATCH /api/v1/responses/:id { status: 'approved' | 'rejected', comment: '...' }
  │     ├── Rails: update ApprovalTask state
  │     ├── Rails: write AuditLog
  │     └── Sidekiq: notify respondent
  └── Closed
```

### 8.5 Analytics Flow

```
GET /api/v1/analytics/dashboard  (org-level)
  └── Rails: aggregates across org's forms
        ├── total_forms / published_forms
        ├── total_responses / this_week
        └── top_forms by response_count

GET /api/v1/forms/:id/analytics  (per-form)
  └── Rails: queries FormResponse table
        ├── overview: count, completion_rate, today, this_week
        ├── trend: daily group by submitted_at (last 30 days)
        ├── question_breakdown: tally payload values per question
        └── quiz: avg_score, score_distribution (if is_quiz)
```

---

## 9. Security Architecture

### 9.1 Authentication

```
Login Flow:
  1. POST /api/v1/auth/login  { email, password }
  2. Rails: User.find_by(email) → BCrypt.verify(password)
  3. Rails: check user.status == 'active'
  4. Rails: update user.last_sign_in_at
  5. Rails: JwtService.issue_for(user) → { user_id, org_id, role, jti, exp }
  6. Response: { token, user }
  7. Client stores token in localStorage (admin: rforms_token, customer: rforms_customer_token)

Token Lifecycle:
  - TTL: 24 hours
  - Revocation: user.jti field; JwtService.decode checks jti matches DB → instant revocation on logout
  - Refresh: re-login (or refresh token flow for V1+)

SSO Flow (V1):
  1. Redirect to Rediff SSO (OAuth2)
  2. Callback with auth code → exchange for SSO token
  3. Resolve or provision app_user from directory attributes
  4. Issue RForms JWT as above
```

### 9.2 Authorization (RBAC)

All protected endpoints call `authenticate_user!` which decodes JWT and sets `current_user`. Pundit policies enforce the PRD §6 permission matrix:

| Capability | super_admin | org_admin | form_owner | editor | viewer | approver | analyst |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create Form | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Edit Form | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Publish / Share | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View Responses | ✓ | ✓ | ✓ | ✓ | optional | ✓ | ✓ |
| Export | ✓ | ✓ | ✓ | optional | ✗ | ✗ | ✓ |
| Delete Form | ✓ | ✓ | owner only | ✗ | ✗ | ✗ | ✗ |
| Make a Copy | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Audit Logs | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 9.3 MFA (V2)

```
If org.mfa_required || form.mfa_required:
  1. Normal login → partial JWT (mfa_pending: true)
  2. POST /auth/mfa/challenge { factor: 'totp' | 'email_otp' | 'sms_otp' }
  3. POST /auth/mfa/verify { code }
  4. On success → full JWT
```

### 9.4 Data Protection

- **CORS**: rack-cors allows only `localhost:3001`, `localhost:3002`, and production domain
- **SQL Injection**: Rails ActiveRecord parameterized queries throughout
- **XSS**: JSON API; no server-rendered HTML; React escapes output
- **CSRF**: JWT-based auth (no cookies) eliminates CSRF surface
- **Rate Limiting**: Rack::Attack (V1) on login and submission endpoints
- **Audit Trail**: Every mutation writes an `AuditLog` record (actor, event, target, IP, timestamp)

---

## 10. Scalability, Availability & Performance

### 10.1 Handling 10M Responses / Day

- Rails instances are **stateless** — scale horizontally behind Nginx load balancer
- Submission path is deliberately thin: gate checks → persist → enqueue (no synchronous fan-out)
- Sidekiq workers (Sheets, email, PDF) absorb spikes without blocking respondents
- MySQL read replicas serve analytics and response-list queries
- Response table can be partitioned by `organization_id` + `submitted_at` at scale

### 10.2 Form Load < 2s

- Published form schemas cached in Redis (key: `form:schema:{id}`) — invalidated on publish
- SPA assets (JS, CSS) served via Nginx with `Cache-Control: immutable` + content-hash filenames
- CDN layer for static assets in production
- Public form endpoint hits Redis first; DB fallback only on cache miss

### 10.3 Availability (99.9%)

- Multi-instance Kubernetes with rolling zero-downtime deploys
- **Graceful degradation**: if Sheets/email/PDF worker fails, core submission still persists; deferred jobs drain when dependency recovers
- MySQL: multi-AZ with automatic failover
- Redis: clustered or Sentinel mode
- Health check at `/up` monitored by load balancer

### 10.4 Caching Strategy

| Cache Key | Content | TTL | Invalidation |
|---|---|---|---|
| `form:schema:{id}` | Published form JSON schema | 24h | On `form.published` |
| `org:branding:{id}` | Org branding config | 1h | On org settings update |
| Rate limit counters | Login/submission counts per IP | 1min rolling | Auto-expire |

---

## 11. Deployment Architecture

### 11.1 Docker Compose (Development / Staging)

```
docker-compose.yml
  ├── db          → MySQL 8.0              (port 3306, internal only)
  ├── redis       → Redis 7 Alpine         (internal only)
  ├── backend     → Rails API             (port 3000)
  ├── sidekiq     → Sidekiq worker        (shares backend image)
  ├── admin-portal → React + Nginx        (port 3001)
  ├── customer-portal → React + Nginx     (port 3002)
  └── nginx       → Reverse proxy         (port 80)
```

### 11.2 Kubernetes (Production)

```
Namespace: rforms-prod
  ├── Deployment: backend          (3+ replicas, HPA on CPU/memory)
  ├── Deployment: sidekiq          (2+ replicas)
  ├── Deployment: admin-portal     (2 replicas, static Nginx)
  ├── Deployment: customer-portal  (2 replicas, static Nginx)
  ├── Deployment: nginx-ingress    (LoadBalancer service, SSL termination)
  │
  ├── StatefulSet / Managed: MySQL  (Primary + read replica)
  ├── StatefulSet / Managed: Redis  (Cluster mode)
  └── PersistentVolume: Object storage (S3-compatible)
```

### 11.3 Environment Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string |
| `REDIS_URL` | Redis connection for Sidekiq and cache |
| `SECRET_KEY_BASE` | JWT HMAC secret |
| `CORS_ORIGINS` | Allowed frontend origins |
| `REACT_APP_API_URL` | Backend API URL baked into SPA at build time |
| `REDIFF_SSO_CLIENT_ID/SECRET` | OAuth2 credentials for SSO |
| `SHEETS_API_KEY` | Rediff Sheets connector credentials |

---

## 12. Observability & Cross-Cutting Concerns

### 12.1 Logging

- Rails logs to stdout (JSON in production, readable in dev)
- Sidekiq logs job execution, retries, and dead-letter events
- Nginx logs access and errors
- All logs shipped to centralized log aggregator (ELK / Loki)

### 12.2 Metrics

- Rails: `prometheus_exporter` gem exposes `/metrics`
- Sidekiq: queue depth, job latency, failure rate
- MySQL: slow query log, connection pool usage
- Custom business metrics: form_created, response_submitted, quiz_scored, sheet_synced

### 12.3 Analytics Events (PRD §26)

| Event | Emitted by | Downstream |
|---|---|---|
| `form_created` | FormsController | Analytics, Audit |
| `form_published` | FormsController | Audit, EmailInviteWorker |
| `response_submitted` | PublicResponsesController | Audit, SheetsWorker, PdfWorker |
| `export_clicked` | ResponsesController | Audit |
| `approval_completed` | Workflow | Audit, EmailWorker |
| `quiz_scored` | FormResponse#calculate_score! | Analytics |
| `document_generated` | PdfGenWorker | Notification |
| `sheet_synced` | SheetsAppendWorker | Analytics |

### 12.4 Internationalization & Accessibility

- **Multilingual (V2)**: SurveyJS supports per-form language variants; org `default_language` and `enabled_languages` configure available options; RTL supported via CSS `dir` attribute
- **WCAG 2.1 AA**: SurveyJS renders accessible markup; admin portal uses semantic HTML; theming validates color contrast before publish; keyboard navigation and ARIA labels enforced

---

## 13. Release Phasing

| Phase | Features | Backend Modules Activated |
|---|---|---|
| **MVP** | Form builder, sharing, responses, basic branding, auto-save, single-response | Auth, Forms, Responses, Templates, Organizations, Audit |
| **V1** | Logic/conditions, analytics, multi-step forms, quiz mode, live Sheets, WCAG AA, approval workflow | Analytics, Quiz scoring, Sheets integration, Workflow (ApprovalTask) |
| **V2** | Document generation, multilingual, AI form generation, MFA enforcement, geo-location, @mentions, embedded forms | Document Gen service, AI Gen service, MFA module, i18n |

---

## 14. Risks & Open Questions

| Risk | Impact | Mitigation |
|---|---|---|
| Rediff Sheets API throughput under 10M/day | Sheet sync backlog | Batch appends; per-form rate caps; dead-letter queue; confirm Sheets quotas |
| LLM latency & cost for AI generation | Slow builder, cost | Async for large jobs; cache LLM responses; draft-only output — confirm provider SLAs |
| MySQL JSON column performance at scale | Slow analytics queries | Add GIN-equivalent MySQL JSON indexes; migrate analytics to separate OLAP store at scale |
| Object storage costs for attachment/PDF | Storage cost growth | Configurable retention policies; lifecycle rules on S3 |
| SurveyJS commercial license at scale | Licensing cost | Evaluate commercial license tiers; haveCommercialLicense flag ready |
| Physical isolation demand from enterprise | Deployment complexity | Keep all DB access through ActiveRecord scopes; separate MySQL schema per tier is an option |

---

*End of High-Level Design. Detailed schemas, API contracts, algorithms, and class designs are specified in the companion document: **RForms — Low-Level Design (LLD) v1.0**.*
