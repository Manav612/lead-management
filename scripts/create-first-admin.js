// Creates (or upgrades) the first admin account on your Supabase project.
// Zero dependencies — uses Node 18+ built-in fetch.
//
// Usage:
//   1. Fill .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//   2. Run:
//        npm run first-admin
//        node scripts/create-first-admin.js admin@yourcompany.com 'Str0ngPass!' 'Full Name'
//
// Idempotent: re-running upgrades the existing account to admin.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// --- minimal .env reader (no dependency needed) ---
function loadEnv(file) {
  try {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env yet */ }
}
loadEnv(join(root, '.env'))

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const [emailArg, passArg, nameArg] = process.argv.slice(2)
const email = (emailArg || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const password = passArg || process.env.ADMIN_PASSWORD
const fullName = nameArg || process.env.ADMIN_NAME || 'Administrator'

if (!url || !key) {
  console.error('✗ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env')
  console.error('  Get them from: Supabase Dashboard → Project Settings → API')
  process.exit(1)
}
if (!email || !password) {
  console.error('✗ Provide the admin email and password:')
  console.error('    node scripts/create-first-admin.js you@company.com \'LongPass123\' \'Your Name\'')
  process.exit(1)
}
if (password.length < 8) {
  console.error('✗ Admin password must be at least 8 characters')
  process.exit(1)
}

const authHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function authFetch(path, init = {}) {
  const res = await fetch(`${url}/auth/v1${path}`, { ...init, headers: { ...authHeaders, ...init.headers } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.msg || body.error_description || `HTTP ${res.status}`)
  return body
}

// 1. Find an existing auth user with this email
const { users } = await authFetch('/admin/users?per_page=500')
const existing = users.find((u) => (u.email || '').toLowerCase() === email)

let authUserId
if (existing) {
  authUserId = existing.id
  console.log(`• Found existing auth user ${email} — will upgrade profile to admin.`)
} else {
  const created = await authFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
  })
  authUserId = created.id || created.user?.id
  console.log(`• Created Supabase auth user ${email} (email confirmed).`)
}

// 2. Upsert the profile row as admin (PostgREST, upsert on id)
const restRes = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
  method: 'POST',
  headers: {
    ...authHeaders,
    Prefer: 'return=minimal, resolution=merge-duplicates'
  },
  body: JSON.stringify({ id: authUserId, email, full_name: fullName, role: 'admin', is_active: true })
})
if (!restRes.ok) {
  const errBody = await restRes.json().catch(() => ({}))
  console.error('✗ Could not upsert the profile row:', errBody.message || `HTTP ${restRes.status}`)
  console.error('  Did you run supabase/migrations/0001_init.sql in the SQL editor first?')
  process.exit(1)
}

console.log('✓ First admin is ready.')
console.log(`  Sign in with:  ${email}`)
console.log(`  Password:      ${existing ? '(unchanged)' : password}`)
