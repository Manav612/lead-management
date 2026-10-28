# LeadFlow CRM

A complete lead generation & management system for a small sales team — in **one project** with two panels:

- **Admin panel** — dashboards, all leads, Excel/CSV import, bulk assignment, employee performance reports, user management, settings.
- **User (employee) panel** — own leads, follow-ups with reminders, calendar, notifications, profile.

Both panels share the same database, authentication, backend API, and design system.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + **JavaScript (no TypeScript)** |
| UI | MUI (Material UI) 5, Recharts, dayjs |
| Forms | React Hook Form + Zod |
| Routing | React Router 6 |
| Backend | Node.js + Express 4 (REST API) |
| Database | Supabase PostgreSQL (+ Auth, Row Level Security) |
| Validation | Zod (shared rules in `api/lib/validators.js`) |
| Deploy | Vercel (static frontend + Express as a Function) |

## Folder structure

```
Lead_MS/
├── api/                    # Express REST API (also runs as a Vercel Function)
│   ├── app.js              # createApp() — shared by local server and Vercel
│   ├── index.js            # local dev server (node --watch index.js)
│   ├── vercel/[...api].js  # Vercel Function wrapper (no listen())
│   ├── config.js           # env config, mode detection
│   ├── lib/                # utils (errors), tokens, Zod schemas
│   ├── stores/             # data layer: localStore (dev) + supabaseStore (prod)
│   ├── services/           # business logic: leads, follow-ups, imports
│   ├── controllers/        # HTTP handlers
│   ├── middleware/auth.js  # Supabase JWT or local-demo token
│   ├── routes/index.js     # all route registration
│   └── __tests__/          # vitest + supertest API tests
├── frontend/               # React app (Vite)
│   ├── src/context/        # AuthContext, ToastContext
│   ├── src/components/     # reusable: ui.jsx, charts.jsx, forms.jsx, Layout.jsx
│   ├── src/features/       # shared feature pages (LeadDetail, FollowUps, Calendar, ImportWizard)
│   ├── src/pages/          # auth.jsx, admin.jsx (Admin panel), user.jsx (User panel)
│   └── tests/              # vitest unit tests
├── supabase/
│   ├── migrations/0001_init.sql   # full schema + RLS + SQL functions
│   └── seed.sql                     # optional demo data
├── scripts/create-first-admin.js  # bootstrap the admin account
├── docs/                     # API contract + frontend spec
├── .env.example / .env       # environment (never commit .env)
└── vercel.json               # deploy config
```

---

## Quick start (local demo mode — no Supabase needed)

The API has a **local demo mode**: when `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not set, it uses an in-memory database pre-seeded with demo accounts and sample leads. Great for exploring the UI.

```bash
# 1. Install everything
npm run install:all

# 2. Run API (:3001) + web app (:5173) together
npm run dev
```

Open **http://localhost:5173** and sign in with a demo account:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@leadflow.local` | `Admin@123` |
| Employee | `priya@leadflow.local` | `User@123` |
| Employee | `arjun@leadflow.local` | `User@123` |

> ⚠️ Demo mode data lives in memory and resets when the server restarts. An amber banner shows while you're in demo mode.

---

## Connecting your Supabase project (real data)

You already have a project — here's the full setup, step by step.

### Step 1 — Copy your credentials

1. Open your Supabase dashboard.
2. Go to **Project Settings → API** (🔧 icon, left sidebar).
3. Copy three values:
   - **Project URL** — looks like `https://xxxx.supabase.co`
   - **`anon` / `public` key** (publishable)
   - **`service_role` key** (secret — treat it like a password)

### Step 2 — Fill the environment files

**Root `.env`** (already created; it has your project URL). Fill in:

```env
SUPABASE_URL=https://axlbdfgrxhixsjcbuuvj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...paste-the-service-role-key...
SUPABASE_PUBLISHABLE_KEY=eyJ...paste-the-anon-key...
APP_SECRET=paste-a-long-random-string   # e.g. from:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CORS_ORIGINS=http://localhost:5173,https://your-deployed-app.vercel.app
```

**`frontend/.env`** (copy from example and fill):

```env
VITE_SUPABASE_URL=https://axlbdfgrxhixsjcbuuvj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...paste-the-anon-key...
```

> The `service_role` key goes **only** in the root `.env`. It must never be exposed to the browser. The frontend uses the public `anon` key for sign-in/sign-out only — all data access goes through the API.

### Step 3 — Create the database schema

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**, paste the entire contents of `supabase/migrations/0001_init.sql`.
3. Click **Run**.

This creates all 9 tables, indexes, RLS policies, and the SQL helper functions (lead code sequence, transactional import, report queries, due-notification generator).

### Step 4 — Create the first admin

```bash
# in the project root (uses .env)
node scripts/create-first-admin.js you@yourcompany.com 'YourLongPassword' 'Your Name'
```

Or set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` and run `npm run first-admin`.

Now sign in at http://localhost:5173 with that email and password. You're an admin.

### Step 5 — (optional) demo data

Paste `supabase/seed.sql` into the SQL editor and run it to load sample leads, activities and follow-ups.

### Step 6 — Create team accounts

In the app: **Admin → Users → Add User**. The script creates the Supabase auth account (email already confirmed) plus the profile row. Employees sign in with the email/password the admin set.

> To let a new user sign in, make sure **Authentication → Providers → Email** is enabled in Supabase (it is by default). New users added through the app are confirmed automatically.

---

## Running the tests

```bash
# API tests (vitest + supertest, local demo mode)
npm --prefix api test

# Frontend unit tests (vitest)
npm --prefix frontend test

# both
npm test
```

## Building

```bash
npm --prefix frontend run build    # outputs frontend/dist
```

## Production deploy (Vercel)

1. Push this folder to a GitHub repository.
2. On [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Vercel detects the `vercel.json` at the root — keep the defaults:
   - Build command: `npm --prefix frontend run build`
   - Output directory: `frontend/dist`
4. Add **environment variables** in the project (Project → Settings → Environment Variables) for **Production**:

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | your project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
   | `SUPABASE_PUBLISHABLE_KEY` | your anon key |
   | `APP_SECRET` | same long random string as `.env` |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` |

   (If you deploy the frontend on the same Vercel project, the rewrite in `vercel.json` routes `/api/*` to the Express function `api/vercel/[...api].js`, so no `VITE_API_BASE_URL` is needed.)

5. Deploy. Then run `node scripts/create-first-admin.js …` once (or create users through the app if you already have an admin from a previous deploy).

> Note: on Vercel the Express app runs as a **serverless Function** — that's why the API is structured as `createApp()` with no `listen()`, and due-date notifications are generated on API calls (polling) instead of background jobs.

## Security notes

- **RLS** is enabled on every table. Employees can only read/write leads assigned to them; admins see everything. Import tables are service-role-only.
- Users are never deleted (audit trail preserved). Deactivating a user (`is_active = false`) immediately blocks their sign-in with 403.
- Import uploads are validated server-side: 5 MB cap, 2000 row cap, HMAC-signed payload between validate and confirm, idempotent confirm (same file can't be imported twice — 409 with the original batch).
- Rate limits: 30 requests / 15 min on auth and import endpoints.
- Passwords: scrypt-hashed in demo mode; Supabase Auth handles them in production.

## Troubleshooting

| Problem | Fix |
|---|---|
| Amber "local demo mode" banner | Your `.env` keys are missing/empty. Check `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, restart `npm run dev`. |
| `relation "public.leads" does not exist` | You haven't run `0001_init.sql` in the SQL editor. |
| `New client errors` / RLS errors in logs | Schema mismatch — re-run the migration in a fresh database, or check you're on the right project. |
| Frontend can't reach API locally | API must be on port 3001. `npm run dev` starts both; the Vite proxy forwards `/api`. |
| Sign-in says "email not confirmed" | If you created the user in Supabase directly (not via the app/script), confirm the email from the inbox, or run the first-admin script again for that user. |

## License

Private — all rights reserved.
