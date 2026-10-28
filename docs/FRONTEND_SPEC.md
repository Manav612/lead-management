# LeadFlow CRM — Frontend Implementation Spec

You are implementing the complete frontend in `frontend/` (React 18 + Vite 5 + JavaScript, NO TypeScript).
The API contract is in `docs/API.md` — read it first; the frontend must match it exactly.

## Hard rules
- JavaScript only (`.js`/`.jsx`). No TypeScript. No Next.js.
- MUI v5 components + `@mui/icons-material`. React Router v6. Axios-free: use the provided fetch client pattern.
- dayjs for dates, with the `utc` + `timezone` plugins; display timezone default `Asia/Kolkata`.
- Recharts for charts. React Hook Form + Zod for forms where a form exists.
- Never invent API endpoints or response shapes that are not in `docs/API.md`.
- The app must work in two modes, chosen at runtime:
  - `VITE_SUPABASE_URL` set → Supabase browser auth (supabase-js) for login/session.
  - not set → local demo mode: auth via `POST /api/auth/login` etc.; show demo credentials on the login page.
- If `GET /api/health` reports `mode: "local-dev"`, show a thin amber banner at the top of every
  authenticated page: "Local demo mode — data is stored in memory and resets on restart."

## Files to create (complete list)

```
frontend/
  package.json
  vite.config.js
  index.html
  .env.example
  src/
    main.jsx
    App.jsx
    theme.js
    config.js
    utils/
      dates.js          # dayjs setup (utc+timezone, Asia/Kolkata default), fmtDateTime, fmtDate, isToday, startOfDay/endOfDay helpers
      format.js         # currency (en-IN, compact for big numbers), phone display
      csv.js            # toCsv(rows, columns) + downloadCsv(filename, csvText) helpers
      validate.js       # zod schemas shared by forms (leadFormSchema, followUpFormSchema, userFormSchema)
    services/
      api.js            # fetch client (see below)
      supabase.js       # browser supabase client (null when not configured)
    context/
      AuthContext.jsx   # user/session state + login/logout + profile
      ToastContext.jsx  # snackbar toasts: useToast().success(msg) / .error(msg)
    components/
      Layout.jsx        # sidebar + topbar shell (role-aware nav), banner, user menu, notifications drawer
      StatCard.jsx      # title, value, sub, icon, tone
      StatusChip.jsx    # color-coded status chip (map below)
      PriorityChip.jsx
      ConfirmDialog.jsx # {open,title,confirmText,danger,onConfirm,onClose,children}
      EmptyState.jsx    # icon + title + hint + optional action button
      PageHeader.jsx    # title + subtitle + actions slot
      DataGrid.jsx      # generic table: columns[{label, key, render?, width?, sortable?}], rows,
                        # server-side pagination {page,pageSize,total,onPageChange,pageSize},
                        # loading skeletons, empty state slot, onRowClick
      SearchField.jsx   # debounced text field with clear button
      LeadForm.jsx      # RHF+zod lead create/edit form (props: initial, onSubmit, canAssign, assignedOptions, sources)
      FollowUpForm.jsx  # RHF+zod follow-up create/edit form (lead picker, type, due, reminder, assignee for admin)
      LeadActivityForm.jsx # activity add form (type, subject, remarks, outcome)
      StatusChangeDialog.jsx # pick new status (+ reason when -> lost)
      LeadQuickActions.jsx    # buttons: add remark, record call, schedule follow-up, change status
      charts/
        StatusPie.jsx
        SourceBar.jsx
        TrendLine.jsx
    layouts/
      AuthLayout.jsx    # centered card with logo for auth pages
      NotFound.jsx      # professional 404
    pages/
      auth/
        Login.jsx
        ForgotPassword.jsx
        ResetPassword.jsx
      admin/
        AdminDashboard.jsx
        AdminLeads.jsx
        AdminLeadNew.jsx
        AdminLeadDetail.jsx   # thin wrapper over shared LeadDetailPage
        ImportPage.jsx
        ImportHistory.jsx
        FollowUpsPage.jsx
        CalendarPage.jsx
        ReportsPage.jsx
        UsersPage.jsx
        SettingsPage.jsx
      user/
        UserDashboard.jsx
        UserLeads.jsx
        UserLeadDetail.jsx    # thin wrapper over shared LeadDetailPage
        UserFollowUps.jsx     # thin wrapper over shared FollowUpsPage
        UserCalendar.jsx      # thin wrapper over shared CalendarPage
        NotificationsPage.jsx
        ProfilePage.jsx
    features/
      LeadDetailPage.jsx  # SHARED by admin & user (role-aware buttons)
      FollowUpsShared.jsx # SHARED follow-ups list (tabs + grid + complete/reschedule dialogs)
      CalendarShared.jsx  # SHARED month calendar of follow-ups
      ImportWizard.jsx    # shared import wizard body used by ImportPage
  tests/
    utils.test.js         # vitest tests for dates.js + format.js + csv.js (must pass)
```

## package.json (use exactly)

```json
{
  "name": "leadflow-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@emotion/react": "^11.13.0",
    "@emotion/styled": "^11.13.0",
    "@mui/icons-material": "^5.16.7",
    "@mui/material": "^5.16.7",
    "@supabase/supabase-js": "^2.45.0",
    "dayjs": "^1.11.13",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.12.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.8",
    "vitest": "^2.1.9"
  }
}
```

## vite.config.js (use exactly)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true }
    }
  }
})
```

## index.html
Standard Vite entry, `<title>LeadFlow CRM</title>`, root div, module script `/src/main.jsx`.

## config.js
```js
export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''   // '' => same origin (dev proxy / Vercel rewrite)
export const HAS_SUPABASE = Boolean(import.meta.env.VITE_SUPABASE_URL)
export const DISPLAY_TZ = import.meta.env.VITE_DISPLAY_TIMEZONE || 'Asia/Kolkata'
```

## services/api.js
Fetch wrapper:
```js
import { API_BASE } from '../config'
const TOKEN_KEY = 'leadflow_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)
export class ApiError extends Error { constructor(message, status, details){ super(message); this.status = status; this.details = details } }
async function request(path, { method = 'GET', body, formData, headers = {}, raw = false } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...headers },
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined
  })
  if (raw) return res
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    setToken(null); window.dispatchEvent(new Event('leadflow:unauthorized'))
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details)
  return data
}
export const api = {
  get: (p) => request(p),
  post: (p, b) => request(p, { method: 'POST', body: b }),
  patch: (p, b) => request(p, { method: 'PATCH', body: b }),
  postForm: (p, fd) => request(p, { method: 'POST', formData: fd }),
  raw: (p, opts = {}) => request(p, { ...opts, raw: true })
}
export async function download(urlPath, filename, { formData } = {}) {
  const opts = formData ? { method: 'POST', formData } : {}
  const res = await request(urlPath, { ...opts, raw: true })
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
```
On the `leadflow:unauthorized` event, AuthContext logs out and navigates to `/login`.

## services/supabase.js
```js
import { createClient } from '@supabase/supabase-js'
import { HAS_SUPABASE } from '../config'
export const supabase = HAS_SUPABASE
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : null
```

## context/AuthContext.jsx
State: `{ status: 'loading'|'authed'|'guest', user: {id,email,full_name,role,is_active}|null, mode }`.
- On mount: if supabase → `getSession()` then set token; subscribe `onAuthStateChange` (SIGNED_IN/INITIAL_SESSION → fetch token + `/api/me`; SIGNED_OUT → clear).
  Else → token from localStorage → `/api/me`.
- `login(email, password)`: supabase mode → `supabase.auth.signInWithPassword` (map errors to friendly messages:
  "Invalid login credentials.", "Email not confirmed. Check your inbox."); local mode → `api.post('/api/auth/login')`
  → `setToken(token)` → `/api/me`.
- `logout()`: supabase → `signOut()`; else `setToken(null)`; clear state; navigate `/login`.
- `refreshMe()` re-fetches `/api/me`.
- Also fetch `GET /api/health` once for `mode`.
Export hook `useAuth()` and provider `AuthProvider`.

## context/ToastContext.jsx
MUI Snackbar + Alert; `useToast()` → `{ success(msg), error(msg), info(msg) }`.

## theme.js
MUI theme:
- palette.primary.main `#2563EB`, dark `#1E40AF`, light `#60A5FA`, secondary `#0EA5E9`, background.default `#F5F7FA`, paper `#FFFFFF`.
- shape.borderRadius 10.
- typography.fontFamily: `'Inter','Segoe UI',system-ui,-apple-system,sans-serif`; h6 weight 700; body1 14px.
- components: MuiPaper elevation 0 by default + `border: '1px solid #E5E9F0'`; MuiButton textTransform none; MuiCard same border; MuiTableCell padding normal; MuiTableHead background `#F8FAFC`; MuiLinearProgress color primary.
- Export `STATUS_META`:
  new: {label:'New', color:'default'}, contacted: {label:'Contacted', color:'info'}, qualified: {label:'Qualified', color:'primary'},
  follow_up: {label:'Follow-up', color:'warning'}, proposal_sent: {label:'Proposal Sent', color:'secondary'},
  won: {label:'Won', color:'success'}, lost: {label:'Lost', color:'error'}, on_hold: {label:'On Hold', color:'default'}
- `PRIORITY_META`: high {label:'High', color:'error'}, medium {label:'Medium', color:'warning'}, low {label:'Low', color:'default'}.

## Layout.jsx
- Left sidebar (width 248, collapses to drawer < md): logo "LeadFlow" (blue), nav items with MUI icons:
  - Admin: Dashboard, Leads, Import (sub-label), Import History, Follow-ups, Calendar, Reports, Users, Settings.
  - User: Dashboard, My Leads, Follow-ups, Calendar, Notifications, Profile.
- Topbar: page search (navigates to leads with query), notification bell with unread badge (polls `GET /api/notifications/unread-count` every 30s) opening a right-side Drawer with the 10 latest notifications (click → navigate to lead + mark read), user menu (name, role chip, Profile (user) / Settings (admin), Logout).
- `<Outlet/>` content area with max-width 1440, padding 24.
- Local-dev amber banner under the topbar when mode is local-dev.
- All fetch failures → toast; loading → skeletons.

## Routing (App.jsx)
```
/login, /forgot-password, /reset-password  (AuthLayout; if already authed → redirect by role)
/admin/*  guarded: RequireAuth + RequireRole('admin')
  /admin/dashboard /admin/leads /admin/leads/new /admin/leads/:id /admin/import /admin/import/history
  /admin/follow-ups /admin/calendar /admin/reports /admin/users /admin/settings
/app/*   guarded: RequireAuth (role user; admin may view but redirects to /admin)
  /app/dashboard /app/leads /app/leads/:id /app/follow-ups /app/calendar /app/notifications /app/profile
/ → redirect by role (loading splash until session restored)
* → NotFound (404 page: big 404, "Page not found", back-to-dashboard button)
```
After login: admin → `/admin/dashboard`, user → `/app/dashboard`.

## Page behaviors

### Login
Email+password form (RHF), friendly errors, link to forgot password. In local demo mode (no VITE_SUPABASE_URL)
show the demo credentials table from the API contract and quick-fill buttons.

### ForgotPassword / ResetPassword
Simple forms per API. In local mode show the returned reset_code in a helper text (dev only).

### AdminDashboard (`GET /api/reports/summary` + `leads-by-status`, `leads-by-source`)
- Date-range picker (dayjs, default: last 30 days, "All time" toggle).
- Row of StatCards: Total Leads, New, Active, Qualified, Due Today, Overdue, Won, Lost, Pipeline Value, Conversion Rate.
- Charts row: StatusPie, SourceBar, TrendLine (leads over time — call `/api/reports/leads-over-time?days=90`).
- Employee distribution list (progress bars), Recent Leads table (5), Overdue follow-ups list (5), Recent imports (3), Recent activities (5).
- Quick actions: + New Lead, Import CSV/XLSX, New User.

### AdminLeads / UserLeads
- Toolbar: SearchField (debounce 350ms), selects: Status, Priority, Source, Assigned To (admin only),
  Follow-up date from/to, Outcome; "Clear filters"; "Add Lead" (admin), "Export CSV" (filtered, via `/api/leads/export`).
- Bulk assign (admin only): checkbox column; when >0 selected show bar with user select + "Assign".
- DataGrid columns: Lead Code (monospace), Name, Company, Phone, Source, Status chip, Priority chip,
  Assigned To, Next Follow-up (red text if overdue), Created. Row click → detail. Server-side pagination.

### AdminLeadNew
Full-width LeadForm (name, company, phone, email, city, source select (from `/api/settings`), interested product,
estimated value, priority, status, assigned-to select (admin), remarks). Submit → create → navigate to detail.

### LeadDetailPage (shared)
- Breadcrumb Leads / <lead_code>.
- Left card: contact info (name, company, phone tel: link, email mailto:, city, source), interested product/service,
  estimated value, priority chip, status chip, assigned employee (admin: reassign select), created/updated dates, next follow-up.
- Right column: StatusChangeDialog trigger + quick actions (Add Remark, Record Call, Schedule Follow-up).
- Tabs:
  1. Activities — vertical MUI Timeline (newest first), each item: icon per type, subject, remarks, outcome, user, time; "Add" button opens LeadActivityForm.
  2. Follow-ups — list of follow-ups for this lead (status chip, due, type, outcome); actions Complete/Reschedule/Cancel; "Schedule follow-up" button.
  3. Status History — table of history rows (old → new, by, reason, time).
- Edit Lead button → opens LeadForm in a dialog (PATCH). Admin-only fields hidden for users.
- All mutations → toast + refetch. Users can act only on their leads (server enforces; UI hides admin-only controls).

### ImportPage (admin)
Wizard steps (MUI Stepper):
1. **Template** — describe the 10 columns, buttons "Download Excel template" / "Download CSV template" (GET template),
   list of validation rules (short bullets).
2. **Upload** — drag-drop or browse (accept .xlsx,.xls,.csv); upload via `api.postForm('/api/imports/validate')`;
   progress bar while uploading. On error (400) show the error prominently (e.g., missing columns).
3. **Preview** — summary chips: Total / Valid / Invalid / Potential duplicates; DataGrid of all rows
   (row_number, name, phone, email, status chip valid/invalid/duplicate, errors joined with ';');
   buttons: "Download error report CSV" (client-generated from invalid+dup rows via utils/csv.js),
   "Back", "Import N valid rows" (option checkbox "Also import N potential duplicates" when duplicates>0).
4. **Result** — after confirm: success panel with batch summary (imported, skipped duplicates, invalid) +
   links "View import history" / "Go to leads".
Keep `payload`+`signature` from the validate response in state for the confirm call.

### ImportHistory
Table of batches (file, by, total/valid/invalid/duplicates/imported, status, when) + row expand or dialog
with error rows (from `GET /api/imports/:id/errors`) + "Download error report" (GET error-report).

### FollowUpsPage (shared FollowUpsShared)
Tabs: Due Today, Upcoming, Overdue, Completed, Cancelled (each tab calls the API with the tab param).
Table: Title, Lead (link), Type icon, Due (red when overdue, green when today), Status chip, Assigned (admin view), Actions:
- Complete (dialog: outcome textarea + optional "schedule next follow-up" datetime+type)
- Reschedule (dialog: new due_at + reminder_at)
- Cancel (confirm dialog)
- "New follow-up" button (admin: any lead; user: only their leads) → FollowUpForm.

### CalendarPage (shared CalendarShared)
Month grid (hand-rolled CSS grid, dayjs for month math). Header: month name + prev/next/today buttons.
Each day cell lists up to 3 follow-ups (dot color by status: blue pending, grey completed, red overdue) + "+n more".
Click a day → side panel with that day's follow-ups and actions (complete/reschedule). Data source:
`GET /api/follow-ups?status=pending` (page 1, pageSize 100) + completed tab for the visible month.
Simplification allowed: fetch pending (pageSize 100) and completed for the current month range.

### ReportsPage (admin)
- Date range filter.
- Cards: Conversion rate, Pipeline value, Won value, Lost count.
- Charts: leads-over-time line, status pie, source bar, won-vs-lost bar (from leads-by-status).
- Tables: Employee performance (name, assigned, won, lost, conversion, pipeline, overdue), Lost reasons (reason, count).
- CSV export buttons per table (client-side via utils/csv.js).

### UsersPage (admin)
- Table: Name, Email, Role chip, Status chip (Active/Inactive), Lead count, Won, Lost, Created.
- "Create user" dialog: full_name, email, password (min 8, show/hide), role select (default user).
- Row actions: Edit (full_name, role — cannot change own role), Activate/Deactivate (confirm; blocked for self).
- Cannot delete users (by design — history must be preserved).

### SettingsPage (admin)
- Manage allowed lead sources: chip list + add source (text) + remove (confirm). Persists via `POST /api/settings`.
- Show read-only summary of app info (mode, base url).

### UserDashboard (`/api/reports/summary` scoped server-side to the user)
StatCards: My Leads, New, Due Today, Overdue, Won, Lost; charts: my leads by status pie; lists: New assigned leads (5),
Follow-ups due today (5), Recently updated leads (5), Recently completed (5). Quick actions: Open lead, Add remark,
Update status, Schedule follow-up (deep links into leads/follow-ups).

### NotificationsPage
List of notifications (icon by type, title, message, time, unread dot); "Mark all read" (loop PATCH read);
click lead-related → open lead. Poll every 30s.

### ProfilePage (user)
Show profile (name, email, role, joined), change password form (calls `/api/auth/reset-password` with a
self-service note, or a simple UI that explains Supabase-managed password reset via forgot-password in supabase mode —
for local mode allow `POST /api/auth/reset-password` without code? No: keep it simple: display profile data,
"Change password" button links to /forgot-password flow. Also "My preferences": display timezone fixed Asia/Kolkata (note).

## Charts
Recharts, height 280, clean colors from theme primary family: ['#2563EB','#60A5FA','#0EA5E9','#34D399','#F59E0B','#EF4444','#A78BFA','#94A3B8'].
Include `<ResponsiveContainer>` in a fixed-height div. Empty data → EmptyState.

## DataGrid requirements
- Sticky header, zebra rows optional, row hover, loading → 5 skeleton rows, empty → EmptyState slot,
  pagination footer: "Rows per page [10/20/50]" + "X–Y of Z" + prev/next + page number.
- `sort` prop optional: sortable columns send `sort`/`dir` to the API.

## Form validation messages
Use Zod `.min(1,'Required')` etc. Phone: required, 10–15 digits after stripping spaces/+/- (zod regex on normalized value).
Email optional but must match when present. estimated_deal_value: number ≥ 0.

## Tests (tests/utils.test.js)
vitest, at least 8 assertions covering: fmtDateTime renders Asia/Kolkata, currency formatting,
csv escaping (comma/quote/newline in values), startOfDay/endOfDay. These must pass with `npm test` in `frontend/`.

## Style quality bar
- Every page: PageHeader with title + subtitle.
- Loading states everywhere (skeletons for cards/tables, CircularProgress in buttons on submit).
- Empty states everywhere (icon + helpful text + primary action when sensible).
- Confirm dialogs for: cancel follow-up, deactivate user, remove source, clear-filters is NOT destructive (no dialog).
- Toasts for every mutation success/failure.
- Accessible labels on all inputs; buttons have clear text (icon-only buttons get tooltips).
