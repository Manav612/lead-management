// End-to-end verification of LeadFlow running in SUPABASE MODE (real project).
// Run from frontend/ after the API has been restarted with the .env keys.
// Exit codes: 0 pass | 3 API not in supabase mode | 4 admin login failed |
//             5 employee not created | 6 import failed | 2 console/page errors
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = 'http://localhost:3001'
const B = 'http://localhost:5173'
const SHOTS = path.join(__dirname, 'ui-shots')
const LOG = path.join(SHOTS, 'trace-supabase.log')
fs.rmSync(LOG, { force: true })
const trace = (m) => { console.log(m); fs.appendFileSync(LOG, m + '\n') }
const ADMIN = { email: 'alok123@gmail.com', password: 'Alok@1234' }
const EMP = { email: 'priya.demo@leadflow.local', password: 'Demo@12345', name: 'Priya Demo' }

const envText = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
const sbUrl = (envText.match(/^SUPABASE_URL=(.*)$/m) || [])[1]?.trim()
const sbPublishable = (envText.match(/^SUPABASE_PUBLISHABLE_KEY=(.*)$/m) || [])[1]?.trim()
const sbService = (envText.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m) || [])[1]?.trim()

// 0) API must be in supabase mode
const h = await (await fetch(API + '/api/health')).json()
trace('API health: ' + JSON.stringify(h))
if (h.mode !== 'supabase') { trace('ABORT: API is in "' + h.mode + '" mode - restart it in VS Code (Ctrl+C, node --watch index.js)'); process.exit(3) }

// 1) Supabase Auth sign-in as new admin (browser flow) -> use the JWT for API calls
const sb = createClient(sbUrl, sbPublishable)
const signIn = await sb.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })
if (signIn.error || !signIn.data?.session) { trace('ABORT: supabase sign-in failed: ' + (signIn.error?.message || 'no session')); process.exit(4) }
const H = { Authorization: 'Bearer ' + signIn.data.session.access_token }
trace('admin Supabase Auth sign-in OK')

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
const errors = []
page.on('pageerror', (e) => { errors.push('pageerror: ' + e.message); trace('PAGEERROR: ' + e.message) })
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
  trace('screenshot: ' + name)
}

// 2) UI login as new admin
await page.goto(B + '/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', ADMIN.email)
await page.fill('input[type="password"]', ADMIN.password)
await page.click('button[type="submit"]')
await page.waitForURL('**/admin/dashboard', { timeout: 20000 })
await page.waitForTimeout(3000)
const body1 = (await page.textContent('body')) || ''
trace('demo-mode banner present: ' + /local demo|demo mode/i.test(body1))
await shot('sup-01-admin-dashboard.png')

// 3) Create employee user (UI Users page -> verifies Supabase auth user creation)
await page.goto(B + '/admin/users', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.click('button:has-text("Add User")')
await page.waitForTimeout(600)
await page.getByLabel('Full Name').fill(EMP.name)
await page.getByLabel('Email').fill(EMP.email)
await page.getByLabel('Password').fill(EMP.password)
const createPost = page.waitForResponse((r) => r.url().includes('/api/users') && r.request().method() === 'POST')
await page.click('.MuiDialog-root button:has-text("Create User")')
const cu = await createPost
trace('create user POST -> ' + cu.status())
await page.waitForTimeout(2500)
await shot('sup-02-users.png')
const users = await (await fetch(API + '/api/users', { headers: H })).json()
const emp = (users.rows || []).find((u) => u.email === EMP.email)
if (!emp) { trace('ABORT: employee not found after creation'); await browser.close(); process.exit(5) }
trace('employee created: ' + emp.full_name + ' id=' + emp.id)

// 4) Import sample-leads.xlsx (exercises import_leads SQL function)
await page.goto(B + '/admin/import', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.setInputFiles('input[type="file"]', path.join(__dirname, '..', '..', 'sample-leads.xlsx'))
await page.waitForTimeout(5000)
await shot('sup-03-import-preview.png')
const confirmBtn = page.locator('button', { hasText: /Import \d+ Leads/ }).first()
if (!(await confirmBtn.count())) { trace('ABORT: no Import confirmation button'); await browser.close(); process.exit(6) }
trace('confirming: ' + (await confirmBtn.textContent()).trim())
const impPost = page.waitForResponse((r) => r.url().includes('/api/imports') && r.request().method() === 'POST')
await confirmBtn.click()
try {
  const ir = await impPost
  trace('import POST -> ' + ir.status() + ' ' + JSON.stringify(await ir.json()).slice(0, 220))
} catch (e) { trace('import response wait: ' + e.message.split('\n')[0]) }
await page.waitForTimeout(6000)
await shot('sup-04-import-done.png')
const leads = await (await fetch(API + '/api/leads?pageSize=100', { headers: H })).json()
trace('leads after import: ' + leads.total)
if (!leads.total || leads.total < 12) { trace('ABORT: expected >=12 leads after import'); await browser.close(); process.exit(6) }

// 5) Assign all leads to the employee (so the user panel has data)
let ok = 0
for (const l of leads.rows) {
  const r = await fetch(API + '/api/leads/' + l.id, {
    method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_to: emp.id })
  })
  if (r.ok) ok++
}
trace('assigned ' + ok + '/' + leads.rows.length + ' leads to ' + EMP.name)
const lead0 = leads.rows[0]

// 6) Reports page (exercises all report_* SQL functions)
await page.goto(B + '/admin/reports', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
await shot('sup-05-reports.png')

// 7) Schedule a follow-up on first lead (exercises follow_ups + ensure_due_notifications)
await page.goto(B + '/admin/leads/' + lead0.id, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.click('button:has-text("Schedule Follow-up")')
await page.waitForTimeout(900)
await page.fill('input[name="title"]', 'Client demo review call')
const now = new Date(Date.now() - 10 * 60000)
const pad = (n) => String(n).padStart(2, '0')
const rem = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
await page.fill('input[name="due_at"]', '2026-11-01T14:00')
await page.fill('input[name="reminder_at"]', rem)
const fuPost = page.waitForResponse((r) => r.url().includes('/api/follow-ups') && r.request().method() === 'POST')
await page.click('.MuiDialog-root button:has-text("Schedule Follow-up")')
const fu = await fuPost
trace('follow-up POST -> ' + fu.status() + ' ' + JSON.stringify(await fu.json()).slice(0, 200))
await page.waitForTimeout(1500)

// 8) Bell: reminder notification should be there
await page.click('[aria-label="Notifications"]')
await page.waitForTimeout(2000)
await shot('sup-06-bell.png')
const bellText = (await page.textContent('body')) || ''
trace('bell shows reminder: ' + bellText.includes('Follow-up reminder'))
await page.keyboard.press('Escape')

// 9) Log out, log in as employee
await page.evaluate(() => localStorage.clear())
await page.goto(B + '/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', EMP.email)
await page.fill('input[type="password"]', EMP.password)
await page.click('button[type="submit"]')
await page.waitForURL('**/app/dashboard', { timeout: 20000 })
await page.waitForTimeout(3000)
await shot('sup-07-employee-dashboard.png')
await page.goto(B + '/app/leads', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await shot('sup-08-employee-leads.png')
const empBody = (await page.textContent('body')) || ''
trace('employee leads page shows first lead name: ' + empBody.includes(lead0.name))

// 10) Direct Postgres check via Supabase REST (proves data really lives in the project)
if (sbService && sbUrl) {
  const rc = await (await fetch(sbUrl + '/rest/v1/leads?select=count', { headers: { apikey: sbService } })).json()
  const rcu = await (await fetch(sbUrl + '/rest/v1/profiles?select=count', { headers: { apikey: sbService } })).json()
  trace('direct Postgres REST: leads=' + JSON.stringify(rc) + ' profiles=' + JSON.stringify(rcu))
}

trace('== SUPABASE VERIFICATION DONE, errors=' + errors.length)
await browser.close()
process.exit(errors.length ? 2 : 0)
