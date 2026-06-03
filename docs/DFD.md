# RForms — Data Flow Diagrams (DFD)

**Document type:** DFD &nbsp;|&nbsp; **Version:** 1.0  
**Derived from:** RForms HLD v1.0 · RForms LLD v1.0 · RForms PRD v2.0

**DFD Notation used in this document:**

```
[ External Entity ]    — actor or system outside RForms
( Process )            — transformation of data
=== Data Store ===     — persistent storage
────► label            — data flow with name
```

---

## Table of Contents

1. [Level 0 — Context Diagram](#1-level-0--context-diagram)
2. [Level 1 — System Decomposition](#2-level-1--system-decomposition)
3. [Level 2 — Authentication & Authorization](#3-level-2--authentication--authorization)
4. [Level 2 — Form Lifecycle](#4-level-2--form-lifecycle)
5. [Level 2 — Response Collection](#5-level-2--response-collection)
6. [Level 2 — Analytics & Reporting](#6-level-2--analytics--reporting)
7. [Level 2 — Approval Workflow](#7-level-2--approval-workflow)
8. [Level 2 — Admin Operations](#8-level-2--admin-operations)
9. [Level 2 — Async Processing](#9-level-2--async-processing)
10. [Level 2 — Template Management](#10-level-2--template-management)

---

## 1. Level 0 — Context Diagram

The entire RForms platform is shown as a single process. External entities send data in and receive data out.

```
                        credentials / JWT
      [ Workspace Admin ] ──────────────────────────────────────────────────►
      [ Form Creator     ]                                                   │
      [ Respondent       ]                                    ┌─────────────────────────────┐
      [ Approver         ] ◄──────────────────────────────── │                             │
      [ Analyst          ]  forms / responses /               │     R F O R M S             │
                            analytics / receipts              │  Enterprise Form Platform   │
                                                             │                             │
      [ Rediff SSO       ] ◄──── SSO token / user attrs ──── │                             │
      [ Rediff Email     ] ◄──── email payload ─────────────  │                             │
      [ Rediff Sheets    ] ◄──── response rows ──────────────  │                             │
      [ PDF Renderer     ] ◄──── template + data ────────────  │                             │
      [ LLM / AI Service ] ◄──── generation prompt ──────────  │                             │
      [ Object Storage   ] ◄──── attachments / PDFs ──────────  └─────────────────────────────┘
```

---

## 2. Level 1 — System Decomposition

The platform is decomposed into 8 major processes. Data stores are shared across processes via the Rails data layer.

```
[ Form Creator ]                [ Respondent ]              [ Approver / Analyst ]
      │                               │                               │
      │ credentials                   │ public token                  │ JWT token
      ▼                               ▼                               ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────────┐
│   1. Auth &     │          │  3. Response     │          │   6. Approval       │
│   Identity      │          │  Collection      │          │   Workflow          │
│   Management   │          │                 │          │                     │
└────────┬────────┘          └────────┬────────┘          └──────────┬──────────┘
         │ JWT + user                 │ payload                       │ decision
         ▼                            ▼                               │
┌─────────────────┐          ┌─────────────────┐                     │
│   2. Form       │          │ === form_responses ===◄────────────────┘
│   Lifecycle     │◄─────────│ (read schema)    │
│   Management   │          └────────┬─────────┘
└────────┬────────┘                  │ response.submitted
         │ form                       ▼
         ▼                  ┌─────────────────┐          ┌─────────────────────┐
  === forms ===             │   9. Async      │          │  4. Analytics &     │
         │                  │   Processing    │◄─────────│  Reporting          │
         │ schema            │  (Sidekiq)      │          │                     │
         ▼                  └────────┬────────┘          └─────────────────────┘
┌─────────────────┐                  │ rows/emails/PDFs
│  10. Template   │          ┌────────┴────────────────────┐
│  Management    │          │                             │
└─────────────────┘   [ Rediff Sheets ]          [ Rediff Email ]
                                                          │
                       ┌──────────────────┐              │
[ Workspace Admin ]───►│  8. Admin        │              │
                       │  Operations      │      [ PDF Renderer ]
                       └─────────────────┘
```

**Data Stores used across all processes:**

```
=== organizations ===   — tenant config, branding, MFA policy
=== users ===           — identity, roles, JTI for revocation
=== forms ===           — schema, status, settings, public_token
=== form_permissions === — per-user role grants on forms
=== form_responses ===  — payload, draft flag, score
=== audit_logs ===      — append-only event trail
=== templates ===       — global and org-scoped form skeletons
[ Redis ]               — schema cache, Sidekiq queue, OTP codes
[ Object Storage ]      — attachments, generated PDFs
```

---

## 3. Level 2 — Authentication & Authorization

```
[ User (any role) ]
       │
       │  { email, password }
       ▼
  ┌────────────────────────────────────────────────┐
  │  3.1  Validate Credentials                      │
  │  • Find user by email in org scope              │
  │  • BCrypt.verify(password, password_digest)     │
  └──────────────────┬─────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │ valid               │ invalid
          ▼                     ▼
  ┌───────────────┐    { error: "Invalid credentials" }
  │  3.2  Check   │    ──────────────────────────────►  [ User ]
  │  Account      │
  │  Status       │
  └───────┬───────┘
          │ status == active
          ▼
  ┌───────────────────────────────────────────────────┐
  │  3.3  Issue JWT                                    │
  │  payload = { user_id, org_id, role, jti, exp }    │
  │  JWT.encode(payload, SECRET_KEY_BASE, HS256)       │
  └──────────────────┬────────────────────────────────┘
          │                          │
          │  update last_sign_in_at  │
          ▼                          ▼
  === users ===              === audit_logs ===
  (last_sign_in_at)          (event: "login")
          │
          │  { token, user }
          ▼
  [ User ]  ──── stores token in localStorage ────►  (every subsequent request)


  ─────────────────────────── PER-REQUEST AUTH ───────────────────────────────

  [ Any Protected Request ]
        │  Authorization: Bearer <token>
        ▼
  ┌──────────────────────────────────────────────┐
  │  3.4  Decode & Validate JWT                   │
  │  • JWT.decode(token, secret, HS256)           │
  │  • check exp not passed                       │
  │  • find User by user_id                       │
  │  • check user.jti == payload.jti (revocation) │
  │  • check user.status == 'active'              │
  └────────────┬─────────────────────────────────┘
               │ sets @current_user
               ▼
  ┌──────────────────────────────────────────────┐
  │  3.5  Pundit Policy Check                    │
  │  authorize(record) → PolicyClass.new(        │
  │    current_user, record).action?             │
  │                                              │
  │  Role resolution:                            │
  │  super_admin ──► all org resources           │
  │  org_admin   ──► all org resources           │
  │  form_owner  ──► own forms + shared forms    │
  │  editor      ──► forms with editor grant     │
  │  viewer      ──► forms with viewer grant     │
  │  approver    ──► responses assigned to them  │
  │  analyst     ──► view + export only          │
  └────────────┬─────────────────────────────────┘
               │ authorized
               ▼
  ┌──────────────────────────────────────────────┐
  │  3.6  Scope Query                            │
  │  policy_scope(Form)                          │
  │  → WHERE organization_id = ? AND             │
  │    (owner_id = ? OR form_permissions.user_id = ?) │
  └──────────────────────────────────────────────┘
               │
               ▼
        === forms ===


  ─────────────────────────── LOGOUT ────────────────────────────────────────

  [ User ]  ──{ DELETE /auth/logout }──►
                                         ┌──────────────────────┐
                                         │  3.7  Revoke Token   │
                                         │  user.jti = new UUID │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                             === users ===
                                             (jti updated)
                                                    │
                                                    ▼
                                             === audit_logs ===
                                             (event: "logout")
```

---

## 4. Level 2 — Form Lifecycle

```
[ Form Creator ]
      │
      │  { title, schema, settings }
      ▼
┌─────────────────────────────────────────────────────────────┐
│  4.1  Create Draft Form                                      │
│  • validate title present                                    │
│  • set owner = current_user, org = current_user.org         │
│  • generate public_token (SecureRandom.urlsafe_base64(16))  │
│  • status = 'draft'                                         │
│  • set JSON defaults (schema:{}, branding:{}, etc.)         │
└─────────────────────┬───────────────────────────────────────┘
                      │ form record
                      ▼
               === forms ===
                      │
                      ▼
              === audit_logs ===
              (event: "form_created")
                      │
                      │  { form_id, public_token, status:"draft" }
                      ▼
              [ Form Creator ]  ──► Admin Portal /forms/:id/edit


  ─────────────────── EDIT (auto-save via SurveyJS Creator) ──────────────────

  [ Form Creator ]
        │  PATCH /forms/:id  { schema, settings }
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  4.2  Update Form                                        │
  │  • PolicyCheck: update? → owner_or_editor? || admin?     │
  │  • Merge params into form record                         │
  │  • Invalidate Redis cache: DEL form:schema:{id}          │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === forms ===  (schema, branding updated)
              === audit_logs ===  (event: "form_updated")


  ──────────────────────────── PUBLISH ───────────────────────────────────────

  [ Form Creator ]
        │  POST /forms/:id/publish
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  4.3  Publish Form                                       │
  │  • PolicyCheck: update? (owner or admin)                 │
  │  • form.status = 'published'                             │
  │  • Invalidate + re-cache schema in Redis                 │
  │    SET form:schema:{id} → schema JSON (TTL 24h)          │
  └────────┬────────────────────┬────────────────────────────┘
           │                    │
           ▼                    ▼
    === forms ===         === audit_logs ===
    (status='published')  (event: "form_published")
           │
           │ form_id (enqueue async)
           ▼
    [ Sidekiq Queue ]
           │
           ▼
    ┌─────────────────────────────────┐
    │  EmailInviteWorker              │
    │  • if audience.type='restricted'│
    │    resolve user emails          │
    │  • send invite via Rediff Email │
    └─────────────────────────────────┘
           │
           ▼
    [ Rediff Email ]  ──────►  [ Audience members ]


  ────────────────────────── COPY (Duplicate) ────────────────────────────────

  [ Form Creator ]
        │  POST /forms/:id/copy
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  4.4  Duplicate Form                                     │
  │  • PolicyCheck: show? (owner, editor, admin)             │
  │  • new_form = form.dup                                   │
  │  • new_form.title = "Copy of #{title}"                   │
  │  • new_form.status = 'draft'                             │
  │  • new_form.public_token = nil (regenerated)             │
  │  • new_form.owner = current_user                         │
  │  • Copies: schema, branding, settings, quiz_config       │
  │  • Does NOT copy: responses, permissions, audit history  │
  └──────────────────┬───────────────────────────────────────┘
                     │ new form record
                     ▼
              === forms ===  (new draft)
              === audit_logs ===  (event: "form_copied", source_id)


  ────────────────────────── DELETE ──────────────────────────────────────────

  [ Form Creator / Admin ]
        │  DELETE /forms/:id
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  4.5  Delete Form                                        │
  │  • PolicyCheck: destroy? → owner? || admin?             │
  │  • Cascade-deletes: form_permissions, form_responses     │
  │  • Removes Redis cache: DEL form:schema:{id}             │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === forms ===  (destroyed)
              === form_responses ===  (cascade destroyed)
              === form_permissions ===  (cascade destroyed)
              === audit_logs ===  (event: "form_deleted")
```

---

## 5. Level 2 — Response Collection

```
  ─────────────────── PUBLIC FORM FETCH ──────────────────────────────────────

  [ Respondent Browser ]
        │  GET /public/forms/:token
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  5.1  Serve Published Form                               │
  │  • Find form by public_token                             │
  │  • Check accepting_responses?:                           │
  │      status == 'published'                               │
  │      expires_at not passed                               │
  │      opens_at not in future                              │
  │      response_cap not reached                            │
  │  • If require_login && no JWT → return 401               │
  │  • Read schema from Redis cache (form:schema:{id})       │
  │    or fallback read from MySQL                           │
  │  • Merge org.branding + form.branding                    │
  └──────────────────┬───────────────────────────────────────┘
                     │ schema + branding + settings
             ┌───────┴───────┐
             │               │
        [ Redis ]      === forms ===
        (cache hit)    (cache miss fallback)
                     │
                     ▼
            [ Respondent ]  ──► SurveyJS renders form


  ─────────────────── AUTO-SAVE (DRAFT) ──────────────────────────────────────

  [ Respondent ]  (typing in form — debounced every 2 seconds)
        │  POST /public/forms/:token/responses  { payload, is_draft: true }
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  5.2  Save Draft Response                                │
  │  • Check form.accepting_responses?                       │
  │  • If authenticated: UPSERT on (form_id, responder_id)  │
  │    else: INSERT new draft (client tracks draft_id)       │
  │  • Store partial payload in form_responses               │
  │  • is_draft = true                                       │
  └──────────────────┬───────────────────────────────────────┘
                     │ draft response record
                     ▼
              === form_responses ===
              (is_draft=true, payload=partial)
                     │
                     │  { response.id }
                     ▼
              [ Respondent ]  ──► client stores draft_id


  ─────────────────── RESUME DRAFT ───────────────────────────────────────────

  [ Authenticated Respondent ]  (returns to form on any device)
        │  GET /public/forms/:token  (with JWT)
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  5.3  Resume Draft                                       │
  │  • Fetch form schema (as 5.1)                            │
  │  • If authenticated: find existing draft for user        │
  │  • Return schema + draft.payload in response             │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === form_responses ===
              (find draft by form_id + responder_id)
                     │
                     │  schema + prefilled payload
                     ▼
              [ Respondent ]  ──► SurveyJS pre-populates fields


  ─────────────────── FINAL SUBMIT ────────────────────────────────────────────

  [ Respondent ]
        │  POST /public/forms/:token/responses  { payload, is_draft: false }
        ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  5.4  Gate Checks (reject before persisting)                         │
  │  ┌─────────────────────────────────────────────────────────────────┐ │
  │  │  Check: form.accepting_responses?                               │ │
  │  │    → status == 'published'          (else 410 Gone)             │ │
  │  │    → expires_at not passed          (else 410 Gone)             │ │
  │  │    → response_cap not reached       (else 409 Conflict)         │ │
  │  │    → single_response: no prior sub  (else 409 Conflict)         │ │
  │  │    → require_login: JWT present     (else 401 Unauthorized)     │ │
  │  └─────────────────────────────────────────────────────────────────┘ │
  └────────────────────────────────────┬─────────────────────────────────┘
                                       │ all checks passed
                                       ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  5.5  Persist Response                                               │
  │  • Build FormResponse:                                               │
  │      payload       = submitted answers                               │
  │      hidden_fields = URL params captured by portal                  │
  │      geo           = lat/lng if consent given                        │
  │      responder_id  = current_user.id (if authenticated)             │
  │      responder_email = user.email or params[:email]                  │
  │      is_draft      = false                                           │
  │      submitted_at  = Time.current                                    │
  │  • Save to MySQL                                                     │
  └────────────────────────────────────┬─────────────────────────────────┘
                                       │ saved response
                                       ▼
                               === form_responses ===
                               === audit_logs ===  (event:"response_submitted")
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
                    ▼                  ▼                   ▼
          ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐
          │  5.6 Quiz    │  │  5.7 Sidekiq     │  │  5.8 Response │
          │  Scoring     │  │  Fan-out         │  │  to Client    │
          │  (if is_quiz)│  │  (non-blocking)  │  │               │
          └──────┬───────┘  └────────┬─────────┘  └───────┬───────┘
                 │                   │                     │
                 ▼                   ├──► SheetsAppendWorker  ──► [ Rediff Sheets ]
         calculate_score!            ├──► PdfGenWorker         ──► [ PDF Renderer ] → Object Storage
         update score/max_score      └──► EmailWorker           ──► [ Rediff Email ] → [ Respondent ]
                 │
                 ▼
         === form_responses ===      { response.id, is_draft:false,
         (score, max_score)          submitted_at, score? }
                                              │
                                              ▼
                                     [ Respondent ]
                                     ──► /thank-you  (custom message + branding)
```

---

## 6. Level 2 — Analytics & Reporting

```
  [ Form Owner / Analyst ]
        │  GET /forms/:id/analytics
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  6.1  Compute Overview Metrics                           │
  │  SELECT COUNT(*) total,                                  │
  │         COUNT(*) FILTER (is_draft=false) submitted,      │
  │         COUNT(*) FILTER (submitted_at >= today) today,   │
  │         COUNT(*) FILTER (submitted_at >= 7d ago) week    │
  │  FROM form_responses WHERE form_id = :id                 │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === form_responses ===


  ┌──────────────────────────────────────────────────────────┐
  │  6.2  Build Daily Trend (last 30 days)                   │
  │  SELECT DATE(submitted_at), COUNT(*)                     │
  │  FROM form_responses                                     │
  │  WHERE form_id = :id AND submitted_at >= 30 days ago     │
  │    AND is_draft = false                                  │
  │  GROUP BY DATE(submitted_at)                             │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === form_responses ===


  ┌──────────────────────────────────────────────────────────┐
  │  6.3  Question Breakdown                                 │
  │  • Read form.schema → extract all question elements      │
  │  • For each question:                                    │
  │    - Iterate all submitted responses                     │
  │    - Tally payload[question_name] values                 │
  │    - Sort by count desc, return top 10 values            │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === forms ===  (schema)
              === form_responses ===  (payload JSON)


  ┌──────────────────────────────────────────────────────────┐
  │  6.4  Quiz Stats (if is_quiz)                            │
  │  • SELECT score, max_score FROM form_responses           │
  │    WHERE form_id = :id AND is_draft = false              │
  │      AND score IS NOT NULL                               │
  │  • Compute avg_score, pass_rate, score_distribution      │
  │    (bucket into 0-20%, 20-40%, 40-60%, 60-80%, 80-100%) │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === form_responses ===
                     │
                     │ { overview, trend[], question_breakdown[], quiz? }
                     ▼
              [ Form Owner / Analyst ]


  ─────────────────── CSV EXPORT ──────────────────────────────────────────────

  [ Form Owner / Analyst ]
        │  GET /forms/:form_id/responses/export?format=csv
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  6.5  Generate CSV Export                                │
  │  • PolicyCheck: view_responses? (owner, editor, analyst) │
  │  • Load all submitted responses for form                 │
  │  • Extract question list from schema                     │
  │  • Build CSV rows: [id, submitted_at, email, q1, q2, ...] │
  │  • Stream CSV bytes to client                            │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === forms ===  (schema → headers)
              === form_responses ===  (rows)
                     │
                     │  CSV file download
                     ▼
              [ Form Owner / Analyst ]
              === audit_logs ===  (event: "export_downloaded")


  ─────────────────── ORG DASHBOARD ──────────────────────────────────────────

  [ Org Admin / Analyst ]
        │  GET /analytics/dashboard
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  6.6  Org-Level Dashboard                                │
  │  • policy_scope(Form) → all org forms                    │
  │  • total_forms / published_forms counts                  │
  │  • Total responses across org                            │
  │  • Responses this week                                   │
  │  • Top 5 forms by response_count                         │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === forms ===
              === form_responses ===
```

---

## 7. Level 2 — Approval Workflow

```
  [ Respondent ]  ──► (Form with approval enabled) ──► response submitted (5.5)
                                                               │
                                                               ▼
                                                  === form_responses ===
                                                  (status = 'submitted')
                                                               │
                                                               │ WorkflowJob enqueued
                                                               ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  7.1  Route to Approver                                                  │
  │  • Read form.audience / approval config                                  │
  │  • If configured: use explicit approver_id                               │
  │  • If directory-based: approver = respondent.manager (from users table)  │
  │  • Create ApprovalTask:                                                  │
  │      state = 'under_review'                                              │
  │      assignee_id = resolved approver                                     │
  │      sla_due_at = now + sla_hours                                        │
  └──────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ├──► === form_responses === (status='under_review')
                                 ├──► === audit_logs === (event:"approval_requested")
                                 │
                                 │ EmailWorker enqueued
                                 ▼
                          [ Rediff Email ] ──► [ Approver ]  (notification)


  [ Approver ]
        │  GET /forms/:id/responses  (filtered: status=under_review)
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  7.2  Review Response                                    │
  │  • PolicyCheck: view_responses? (approver role)          │
  │  • Load response payload for review                      │
  └──────────────────┬───────────────────────────────────────┘
                     │ response data
                     ▼
              === form_responses ===


  [ Approver ]
        │  PATCH /forms/:form_id/responses/:id
        │  { status: "approved" | "rejected", comment: "..." }
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  7.3  Record Decision                                    │
  │  • PolicyCheck: approver role on this form               │
  │  • Update FormResponse.status                            │
  │  • Update ApprovalTask: state, decided_at                │
  │  • Append comment to ApprovalTask.comments               │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ├──► === form_responses ===  (status = approved/rejected)
                     ├──► === audit_logs ===  (event: "approval_completed")
                     │
                     │ EmailWorker enqueued
                     ▼
              [ Rediff Email ] ──► [ Respondent ]  (decision notification)


  ─────────────────── SLA BREACH ──────────────────────────────────────────────

  [ Sidekiq Scheduler ]  (periodic check)
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  7.4  SLA Timer Check                                    │
  │  • Find ApprovalTasks WHERE sla_due_at < now             │
  │    AND state = 'under_review'                            │
  │  • For each: EmailWorker → escalation to admin           │
  └──────────────────────────────────────────────────────────┘
        │
        ▼
  === audit_logs ===  (event: "sla_breached")
  [ Rediff Email ] ──► [ Workspace Admin ]
```

---

## 8. Level 2 — Admin Operations

```
  ─────────────────── USER MANAGEMENT ────────────────────────────────────────

  [ Workspace Admin ]
        │  POST /users  { email, name, role, department }
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  8.1  Create User                                        │
  │  • PolicyCheck: admin? (org_admin or super_admin)        │
  │  • Scoped to current_user.organization                   │
  │  • BCrypt.generate(password)                             │
  │  • Generate JTI (SecureRandom.uuid)                      │
  │  • Assign role from allowed set                          │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === users ===  (new record)
              === audit_logs ===  (event: "user_created")


  [ Workspace Admin ]
        │  PATCH /users/:id  { role, status, department }
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  8.2  Update User                                        │
  │  • PolicyCheck: admin? or self                           │
  │  • Update allowed fields                                 │
  │  • If status → inactive: revoke JWT (new jti)            │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === users ===  (updated)
              === audit_logs ===  (event: "user_updated")


  ─────────────────── ORGANIZATION SETTINGS ────────────────────────────────

  [ Workspace Admin ]
        │  PATCH /organization  { branding, mfa_required, default_language }
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  8.3  Update Org Settings                                │
  │  • PolicyCheck: org_admin? or super_admin?               │
  │  • Update organization record                            │
  │  • Invalidate Redis cache: DEL org:branding:{id}         │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === organizations ===  (branding, mfa_required, etc.)
              [ Redis ]  (org:branding cache invalidated)
              === audit_logs ===  (event: "org_settings_updated")


  ─────────────────── AUDIT LOG QUERY ─────────────────────────────────────────

  [ Workspace Admin ]
        │  GET /admin/audit_logs?event=&actor_id=&from=&to=
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  8.4  Query Audit Trail                                  │
  │  • PolicyCheck: admin only                               │
  │  • SELECT * FROM audit_logs                              │
  │    WHERE organization_id = ?                             │
  │      AND event = ? (optional filter)                     │
  │      AND actor_id = ? (optional)                         │
  │      AND created_at BETWEEN ? AND ?                      │
  │  • ORDER BY created_at DESC                              │
  │  • Paginated (50 per page)                               │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === audit_logs ===
                     │
                     │  [{ id, event, actor, target_type, target_id, metadata, ip, ts }]
                     ▼
              [ Workspace Admin ]
```

---

## 9. Level 2 — Async Processing (Sidekiq)

```
  All workers share this pattern:
  Rails API → enqueue job → Redis queue → Sidekiq worker → external system


  ─────────────────── SHEETS SYNC ─────────────────────────────────────────────

  === form_responses ===  (response persisted with is_draft=false)
        │
        │  SheetsAppendWorker.perform_async(response.id)
        ▼
  [ Redis Sidekiq Queue: low ]
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  9.1  SheetsAppendWorker                                 │
  │  • Load FormResponse + Form                              │
  │  • Check form.sheets_capture_enabled?                    │
  │  • Build row: [id, submitted_at, email, q1, q2, ...]    │
  │  • Call RediffSheetsClient.append(sheet_url, row,        │
  │      idempotency_key: response.id)                       │
  │  • On RateLimitError: let Sidekiq retry (backoff)        │
  │  • On NotFoundError: disable sheets for this form        │
  │  • After 5 failures: dead letter queue → alert           │
  └──────────────────┬───────────────────────────────────────┘
                     │ append row
                     ▼
              [ Rediff Sheets ]  ──── appended row ────► sheet


  ─────────────────── PDF RECEIPT GENERATION ──────────────────────────────────

  === form_responses ===  (response persisted)
        │
        │  PdfGenWorker.perform_async(response.id)
        ▼
  [ Redis Sidekiq Queue: low ]
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  9.2  PdfGenWorker                                       │
  │  • Load FormResponse + Form + Organization               │
  │  • Merge branding (logo, colors) into template           │
  │  • Substitute {{field_name}} → payload values            │
  │  • Call Prawn / PDF Renderer to generate bytes           │
  │  • Upload PDF to Object Storage                          │
  │  • Store storage_key on response                         │
  │  • If configured: attach PDF to confirmation email       │
  └──────────────────┬───────────────────────────────────────┘
                     │ PDF bytes
                     ▼
              [ PDF Renderer ]
                     │ PDF file
                     ▼
              [ Object Storage ]  (s3://rforms/receipts/{response_id}.pdf)
                     │
                     │  optional: email delivery
                     ▼
              [ Rediff Email ] ──► [ Respondent ]


  ─────────────────── EMAIL INVITE ────────────────────────────────────────────

  === forms ===  (status changed to 'published')
        │
        │  EmailInviteWorker.perform_async(form.id)
        ▼
  [ Redis Sidekiq Queue: default ]
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  9.3  EmailInviteWorker                                  │
  │  • Load Form + audience config                           │
  │  • audience.type == 'restricted':                        │
  │      resolve user emails from audience.users[]           │
  │      resolve group memberships from audience.groups[]    │
  │  • audience.type == 'open': no invite, link-only         │
  │  • For each email:                                       │
  │      compose email with form title, creator, CTA link    │
  │      send via Rediff Email API                           │
  └──────────────────┬───────────────────────────────────────┘
                     │ email payload
                     ▼
              [ Rediff Email ] ──► [ Audience Members ]


  ─────────────────── AI FORM GENERATION (V2) ─────────────────────────────────

  [ Form Creator ]
        │  POST /forms/ai-generate  { prompt, source_doc? }
        ▼
  [ Redis Sidekiq Queue: default ]
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  9.4  AiFormGenWorker                                    │
  │  • Build constrained prompt:                             │
  │      "Generate a SurveyJS JSON schema for: {prompt}"    │
  │  • Call LLM API with schema constraint                   │
  │  • Validate response with FormLogicValidator             │
  │  • On validation failure: one repair round-trip          │
  │  • Return validated schema as editable DRAFT to creator  │
  │  • Never auto-publish; creator reviews before save       │
  └──────────────────┬───────────────────────────────────────┘
                     │ prompt
                     ▼
              [ LLM / AI Service ]
                     │ candidate JSON
                     ▼
              ┌──────────────────────────┐
              │  FormLogicValidator      │
              │  validate(candidate)     │
              └──────────────────────────┘
                     │ valid schema
                     ▼
              [ Form Creator ]  ──► loaded into SurveyJS Creator as draft
```

---

## 10. Level 2 — Template Management

```
  ─────────────────── BROWSE TEMPLATES ───────────────────────────────────────

  [ Form Creator ]
        │  GET /templates
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  10.1  List Available Templates                          │
  │  SELECT * FROM templates                                 │
  │  WHERE is_global = true                                  │
  │     OR organization_id = current_org                     │
  │  ORDER BY category, name                                 │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === templates ===
                     │
                     │  [{ id, name, category, description, thumbnail_url }]
                     ▼
              [ Form Creator ]  ──► Template Picker modal in Admin Portal


  ─────────────────── USE TEMPLATE ────────────────────────────────────────────

  [ Form Creator ]
        │  POST /templates/:id/use
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  10.2  Create Form from Template                         │
  │  • Load template (must be global or in creator's org)    │
  │  • Create new Form:                                      │
  │      title = template.name                              │
  │      description = template.description                  │
  │      schema = template.schema  (deep copy)               │
  │      status = 'draft'                                    │
  │      owner = current_user                                │
  └──────────────────┬───────────────────────────────────────┘
                     │ new form
                     ▼
              === forms ===  (new draft)
              === audit_logs ===  (event: "form_created")
                     │
                     │  { form_id }
                     ▼
              [ Form Creator ]  ──► /forms/:id/edit  (builder opens with schema)


  ─────────────────── GLOBAL TEMPLATE SEEDING ─────────────────────────────────

  [ System (db:seed on startup) ]
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  10.3  Seed Built-in Templates                           │
  │  For each template in seed list:                         │
  │  Template.find_or_create_by!(name:, is_global: true)     │
  │  Categories: hr, sales, operations, event, education     │
  └──────────────────┬───────────────────────────────────────┘
                     │
                     ▼
              === templates ===
              (5 built-in global templates seeded on first boot)
```
