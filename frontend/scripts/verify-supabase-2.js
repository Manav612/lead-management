// Continuation of Supabase verification (import + user row already exist from run 1).
// Steps: user-create 201 fix, 409 dup check, assign leads, reports page,
// follow-up + bell, employee login, direct Postgres check.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = 'http://localhost:3001'
const B = 'http://localhost:5173'
const SHOTS = path.join(__dirname, 'ui-shots')
const LOG = path.join(SHOTS, 'trace-supabase2.log')
fs.rmSync(LOG, { force: true })
const trace = (m) => { console.log(m); fs.appendFileSync(LOG, m + '\n') }
const ADMIN = { email: 'alok123@gmail.com', password: 'Alok@1234' }
const EMP = { email: 'priya.demo@leadflow.local', password: 'Demo@12345' }
const NEWUSER = { full_name: 'Verify Two', email: 'verify.two@leadflow.local', password: 'Demo@12345', role: 'user' }

const envText = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
const sbUrl = (envText.match(/^SUPABASE_URL=(.*)$/m) || [])[1]?.trim()
const sbPublishable = (envText.match(/^SUPABASE_PUBLISHABLE_KEY=(.*)$/m) || [])[1]?.trim()
const sbService = (envText.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m) || [])[1]?.trim()

const sb = createClient(sbUrl, sbPublishable)
const signIn = await sb.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })
if (signIn.error || !signIn.data?.session) { trace('ABORT: admin sign-in failed'); process.exit(1) }
const H = { Authorization: 'Bearer ' + signIn.data.session.access_token }
trace('admin JWT OK')

// A) fixed user creation -> expect 201 (or 409 if a previous run already created it)
const cu = await fetch(API + '/api/users', {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(NEWUSER)
})
trace('create new user -> ' + cu.status + ' ' + JSON.stringify(await cu.json().catch(() => ({}))).slice(0, 200))
if (cu.status !== 201 && cu.status !== 409) { trace('ABORT: user create fix not verified'); process.exit(1) }

// B) duplicate email -> expect 409
const cu2 = await fetch(API + '/api/users', {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(NEWUSER)
})
trace('duplicate user -> ' + cu2.status + ' (expect 409)')

// C) find employee + leads, assign all leads to employee
const users = await (await fetch(API + '/api/users', { headers: H })).json()
const emp = users.rows.find((u) => u.email === EMP.email)
if (!emp) { trace('ABORT: employee not found'); process.exit(1) }
const leads = await (await fetch(API + '/api/leads?pageSize=100', { headers: H })).json()
trace('leads found: ' + leads.total)
let ok = 0
for (const l of leads.rows) {
  const r = await fetch(API + '/api/leads/' + l.id, {
    method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_to: emp.id })
  })
  if (r.ok) ok++
}
trace('assigned ' + ok + '/' + leads.rows.length + ' leads to ' + emp.full_name)
const lead0 = leads.rows[0]

// D) UI as admin: reports page
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
const errors = []
page.on('pageerror', (e) => { errors.push('pageerror: ' + e.message); trace('PAGEERROR: ' + e.message) })
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

await page.goto(B + '/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', ADMIN.email)
await page.fill('input[type="password"]', ADMIN.password)
await page.click('button[type="submit"]')
await page.waitForURL('**/admin/dashboard', { timeout: 25000 })
await page.waitForTimeout(2500)
trace('admin UI login OK -> ' + page.url().replace(B, ''))

await page.goto(B + '/admin/reports', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
await page.screenshot({ path: path.join(SHOTS, 'sup-05-reports.png'), fullPage: true })
trace('reports page rendered')

// E) follow-up with past reminder on first lead
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
trace('follow-up POST -> ' + fu.status)
await page.waitForTimeout(1500)

// F) bell
await page.click('[aria-label="Notifications"]')
await page.waitForTimeout(2000)
await page.screenshot({ path: path.join(SHOTS, 'sup-06-bell.png') })
const bellText = (await page.textContent('body')) || ''
trace('bell shows reminder: ' + bellText.includes('Follow-up reminder'))
await page.keyboard.press('Escape')

// G) log out, log in as employee
await page.evaluate(() => localStorage.clear())
await page.goto(B + '/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', EMP.email)
await page.fill('input[type="password"]', EMP.password)
await page.click('button[type="submit"]')
await page.waitForURL('**/app/dashboard', { timeout: 25000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: path.join(SHOTS, 'sup-07-employee-dashboard.png'), fullPage: true })
await page.goto(B + '/app/leads', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: path.join(SHOTS, 'sup-08-employee-leads.png'), fullPage: true })
const empBody = (await page.textContent('body')) || ''
trace('employee leads page shows first lead name: ' + empBody.includes(lead0.name))

// H) direct Postgres check
const rc = await (await fetch(sbUrl + '/rest/v1/leads?select=count', { headers: { apikey: sbService } })).json()
const rcu = await (await fetch(sbUrl + '/rest/v1/profiles?select=count', { headers: { apikey: sbService } })).json()
const rcfu = await (await fetch(sbUrl + '/rest/v1/follow_ups?select=count', { headers: { apikey: sbService } })).json()
const rcn = await (await fetch(sbUrl + '/rest/v1/notifications?select=count', { headers: { apikey: sbService } })).json()
trace('direct Postgres: leads=' + JSON.stringify(rc) + ' profiles=' + JSON.stringify(rcu) + ' follow_ups=' + JSON.stringify(rcfu) + ' notifications=' + JSON.stringify(rcn))

trace('== SUPABASE VERIFICATION PART 2 DONE, errors=' + errors.length)
console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
process.exit(errors.length ? 2 : 0)
