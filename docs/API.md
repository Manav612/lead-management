# LeadFlow CRM — REST API Contract

Base URL (local dev): `http://localhost:3001/api` (the Vite dev server proxies `/api/*` here).
All request/response bodies are JSON unless stated otherwise. All timestamps are ISO-8601 UTC strings.

## Conventions

- **Auth**: every protected endpoint requires header `Authorization: Bearer <token>`.
  - Supabase mode: the Supabase access token from `supabase.auth` (browser client).
  - Local demo mode: the token returned by `POST /api/auth/login`.
- **Errors**: every non-2xx returns `{ "error": "human readable message", "details": [ ... ]? }`.
  - `400` validation, `401` missing/invalid token, `403` role not allowed, `404` not found,
    `409` conflict, `413` file too large.
- **Pagination** (where supported): query `page` (1-based, default 1), `pageSize` (default 20, max 100).
  Response: `{ "rows": [...], "total": N, "page": p, "pageSize": s }`.
- **Role scoping (server-enforced)**:
  - `admin` sees all leads/follow-ups/activities.
  - `user` sees only leads where `assigned_to = their id`; follow-ups where `assigned_to = their id`.
  - Users can edit only allowed fields of their own leads. Users can never create users, import,
    or change `assigned_to`/`role`.

## Enums

- `status`: `new` | `contacted` | `qualified` | `follow_up` | `proposal_sent` | `won` | `lost` | `on_hold`
- `priority`: `high` | `medium` | `low`
- `activity_type`: `call` | `email` | `meeting` | `whatsapp` | `note` | `status_change` | `other`
- `follow_up_type`: `call` | `email` | `meeting` | `whatsapp` | `other`
- `follow_up_status`: `pending` | `completed` | `cancelled`
- `role`: `admin` | `user`

## Lead object

```json
{
  "id": "uuid",
  "lead_code": "LD-2026-000001",
  "name": "string",
  "company_name": "string|null",
  "phone": "string",
  "email": "string|null",
  "city": "string|null",
  "lead_source": "string|null",
  "interested_product_or_service": "string|null",
  "estimated_deal_value": 0.0,
  "priority": "high",
  "status": "new",
  "assigned_to": "uuid|null",
  "assigned_to_name": "string|null",
  "general_remarks": "string|null",
  "import_batch_id": "uuid|null",
  "created_by": "uuid",
  "created_by_name": "string|null",
  "next_follow_up_at": "2026-10-25T09:30:00+00:00|null",
  "created_at": "2026-10-24T01:00:00+00:00",
  "updated_at": "2026-10-24T01:00:00+00:00"
}
```

---

## Endpoints

### Health
- `GET /api/health` → `{ "status": "ok", "mode": "supabase" | "local-dev", "time": "ISO" }`
  (public)

### Auth (local demo mode only; in Supabase mode the browser handles sign-in via supabase-js)
- `POST /api/auth/login` body `{ "email", "password" }`
  → `200 { "token": "string", "user": { "id", "email", "full_name", "role" } }`
  → `401` bad credentials. In Supabase mode returns `400` with error explaining to use Supabase auth.
- `POST /api/auth/forgot-password` body `{ "email" }`
  → `200 { "message": "...", "reset_code": "string" }` — `reset_code` is only included in local
  demo mode (no email provider). In Supabase mode the message says the reset email was requested.
- `POST /api/auth/reset-password` body `{ "email", "code", "password" }` (password ≥ 8 chars)
  → `200 { "message": "Password updated." }`

### Session
- `GET /api/me` → `{ "mode": "...", "user": { "id", "email", "full_name", "role", "is_active" } }`
  (authenticated; `403` if the account is deactivated)

### Leads
- `GET /api/leads` (authenticated)
  Query: `search` (name/company/phone/email/lead_code), `status`, `priority`, `source`,
  `assigned_to` (uuid, admin only), `dateFrom`/`dateTo` (created-at range, yyyy-mm-dd),
  `fuFrom`/`fuTo` (next-follow-up range, yyyy-mm-dd), `outcome` = `won`|`lost`,
  `sort` (one of: `created_at`, `name`, `status`, `priority`, `next_follow_up_at`, `estimated_deal_value`; default `created_at`),
  `dir` = `asc`|`desc` (default `desc`), `page`, `pageSize`.
  → `{ rows: Lead[], total, page, pageSize }`
- `POST /api/leads` (admin, and user when `assigned_to` is omitted → assigned to the caller)
  Body: `{ name*, company_name, phone*, email, city, lead_source, interested_product_or_service,
  estimated_deal_value, priority, status, assigned_to (admin only), general_remarks }`
  (`*` required) → `201 { lead: Lead }`
- `GET /api/leads/:id` → `{ lead: Lead }` (users only for their own leads)
- `PATCH /api/leads/:id` (owner/admin)
  Body: any subset of `{ name, company_name, phone, email, city, lead_source,
  interested_product_or_service, estimated_deal_value, priority, status, general_remarks,
  assigned_to (admin only), loss_reason (required when status → lost) }`
  On `status` change the server writes a `lead_status_history` row and a `status_change` activity
  automatically. → `{ lead: Lead }`
  Rules: a `user` cannot set `assigned_to`; status `lost` requires `loss_reason`.
- `POST /api/leads/bulk-assign` (admin) body `{ "lead_ids": ["uuid"...], "assigned_to": "uuid|null" }`
  → `{ "updated": N }`
- `GET /api/leads/export` (same filters as `GET /api/leads`, no pagination)
  → CSV file (`text/csv`, header `Lead Code,Name,Company Name,Phone,Email,City,Lead Source,
  Interested Product/Service,Estimated Deal Value,Priority,Status,Assigned To,Next Follow-up,Created At`).

### Import (admin only)
- `GET /api/imports/template?format=xlsx|csv` → file download
  (`leadflow-template.xlsx` / `leadflow-template.csv`). Columns, exactly:
  `Lead Name | Company Name | Phone Number | Email | City | Lead Source |
  Interested Product/Service | Estimated Deal Value | Priority | Remarks` — one example row included.
- `POST /api/imports/validate` (multipart/form-data, field `file`, max 5 MB, `.xlsx|.xls|.csv`)
  → `200 {
      "summary": { "total_rows": n, "valid_rows": n, "invalid_rows": n, "duplicate_rows": n },
      "rows": [ { "row_number": 2, "name", "phone", "email", "status": "valid"|"invalid"|"duplicate",
                  "errors": ["...", ...] } ],
      "payload": "string", "signature": "string", "expires_in_seconds": 3600 }
    `
  → `400` bad file / missing required columns (message lists the missing headers).
- `POST /api/imports/confirm` body `{ "payload", "signature", "include_duplicates": bool }`
  → `201 { "batch": {
      "id", "original_filename", "total_rows", "valid_rows", "invalid_rows", "duplicate_rows",
      "imported_rows", "skipped_duplicates": n, "import_status": "completed",
      "created_at", "completed_at" } }`
  Server re-validates and re-checks duplicates; tampered/expired payloads → `400`.
  Duplicate confirmation of the same payload returns the existing batch (`409` → `batch`).
- `GET /api/imports` → paginated `{ rows: Batch[], total, page, pageSize }` (newest first)
- `GET /api/imports/:id` → `{ batch: Batch }`
- `GET /api/imports/:id/errors` → `{ rows: [ { "row_number", "raw_row_data": {...},
  "error_messages": ["..."] } ], total }`
- `GET /api/imports/:id/error-report` → CSV download of all error rows for that batch.

Batch object: `{ id, original_filename, uploaded_by, uploaded_by_name, total_rows, valid_rows,
invalid_rows, duplicate_rows, imported_rows, import_status, signature_hash, created_at, completed_at }`

### Activities
- `GET /api/leads/:id/activities` → `{ rows: [ { "id", "lead_id", "user_id", "user_name",
  "activity_type", "subject", "remarks", "outcome", "created_at" } ] }` (oldest first)
- `POST /api/leads/:id/activities` (lead owner/admin) body `{ "activity_type", "subject",
  "remarks", "outcome" }` → `201 { activity }`
- `GET /api/leads/:id/status-history` → `{ rows: [ { "id", "lead_id", "old_status", "new_status",
  "changed_by", "changed_by_name", "reason", "created_at" } ] }`

### Follow-ups
- `GET /api/follow-ups` query: `tab` = `today` | `upcoming` | `overdue` | `completed` | `cancelled`
  (or explicit `status`), `lead_id`, `assigned_to` (admin), `page`, `pageSize`
  → `{ rows: FollowUp[], total, page, pageSize }` (role-scoped)
- `POST /api/follow-ups` body `{ "lead_id"*, "title"*, "description", "follow_up_type",
  "due_at"* (ISO datetime), "reminder_at", "assigned_to" (admin only; default: lead's assignee or
  the caller) }` → `201 { follow_up: FollowUp }` — also notifies the assignee.
- `PATCH /api/follow-ups/:id` (owner/admin) body any subset of `{ title, description,
  follow_up_type, due_at, reminder_at, status: "pending"|"cancelled", assigned_to (admin) }`
  → `{ follow_up }`
- `POST /api/follow-ups/:id/complete` body `{ "outcome", "next_follow_up_at" (optional ISO),
  "next_follow_up_type" }` → `{ follow_up }` — if `next_follow_up_at` given, a new pending
  follow-up is created for the same lead.

FollowUp object: `{ id, lead_id, lead_code, lead_name, assigned_to, assigned_to_name, created_by,
created_by_name, title, description, follow_up_type, due_at, reminder_at, status, outcome,
completed_at, created_at, updated_at }`

### Users (admin only)
- `GET /api/users` query `search` → `{ rows: [ { "id", "full_name", "email", "role", "is_active",
  "lead_count", "won_count", "lost_count", "created_at" } ] }`
- `POST /api/users` body `{ "full_name", "email", "password" (≥8), "role": "user"|"admin" }`
  → `201 { user }`. In Supabase mode the account is created via the Supabase Admin API.
  (An admin cannot demote or deactivate their own account.)
- `PATCH /api/users/:id` body any subset of `{ full_name, role, is_active }`
  → `{ user }`. Changing `is_active=false` deactivates (the user can no longer sign in / API calls).

### Notifications (authenticated, always own)
- `GET /api/notifications` query `unreadOnly` = `true`?, `page`, `pageSize`
  → `{ rows: [ { "id", "user_id", "lead_id", "lead_code", "lead_name", "follow_up_id",
    "title", "message", "notification_type", "is_read", "created_at" } ], total, page, pageSize }`
  (newest first; the server also idempotently materialises due/overdue follow-up reminders)
- `GET /api/notifications/unread-count` → `{ "count": n }`
- `PATCH /api/notifications/:id/read` → `{ "ok": true }`

### Reports (admin: all data; user: only their data)
- `GET /api/reports/summary` query `dateFrom`, `dateTo` (yyyy-mm-dd, optional)
  → `{ "total_leads": n, "new_leads": n, "active_leads": n, "qualified_leads": n,
       "follow_ups_due_today": n, "overdue_follow_ups": n, "won_leads": n, "lost_leads": n,
       "pipeline_value": 0.0, "conversion_rate": 0.0, "recent_activities": [Activity...],
       "recent_imports": [Batch...], "employee_distribution": [ { "name", "lead_count" } ],
       "leads_by_status": [ { "status", "count" } ], "leads_by_source": [ { "source", "count" } ] }`
  - `conversion_rate` = `won / (won + lost) * 100` (rounded to 1 decimal; `0` when no won/lost).
  - `pipeline_value` = sum of `estimated_deal_value` of leads not in `won`/`lost`.
  - `active_leads` = leads not in `won`/`lost`/`on_hold`.
- `GET /api/reports/leads-by-status` → `{ "rows": [ { "status", "count", "value" } ] }`
- `GET /api/reports/leads-by-source` → `{ "rows": [ { "source", "count", "value" } ] }`
- `GET /api/reports/leads-over-time?days=90` → `{ "rows": [ { "date": "yyyy-mm-dd", "count" } ] }`
- `GET /api/reports/performance` → `{ "rows": [ { "user_id", "name", "assigned", "won", "lost",
  "conversion_rate", "pipeline_value", "overdue_follow_ups" } ] }`
- `GET /api/reports/lost-reasons` → `{ "rows": [ { "reason", "count" } ] }`
- `GET /api/reports/export?type=status|source|performance` → CSV download.

### Settings (admin only)
- `GET /api/settings` → `{ "lead_sources": ["...", ...] }`
- `POST /api/settings` body `{ "lead_sources": ["...", ...] }` → `{ "ok": true }`

---

## Local demo mode (explicit)

When `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are absent, the API serves an in-memory store with
sample data and these demo accounts (shown on the login page in this mode):

| Role  | Email                | Password    |
|-------|----------------------|-------------|
| admin | admin@leadflow.local | Admin@123   |
| user  | priya@leadflow.local | User@123    |
| user  | arjun@leadflow.local | User@123    |

`GET /api/health` reports `"mode": "local-dev"`; the UI shows a persistent banner
"Local demo mode — data is stored in memory and resets on restart". No real credentials are used.
