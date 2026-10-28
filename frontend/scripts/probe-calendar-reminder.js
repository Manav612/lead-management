import { chromium } from 'playwright'
import fs from 'node:fs'
const API = 'http://localhost:3001'
const B = 'http://localhost:5173'
const LOG = 'scripts/ui-shots/trace-calendar.log'
fs.rmSync(LOG, { force: true })
const trace = (m) => { console.log(m); fs.appendFileSync(LOG, m + '\n') }

// --- API setup: find Rohan Gupta (admin token sees all leads)
const login = await fetch(API + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@leadflow.local', password: 'Admin@123' })
}).then((r) => r.json())
const H = { Authorization: 'Bearer ' + login.token }
const leads = await fetch(API + '/api/leads?pageSize=100', { headers: H }).then((r) => r.json())
const rohan = leads.rows.find((l) => l.name === 'Tarun Mehta')
trace('target lead: ' + (rohan ? rohan.lead_code + ' ' + rohan.name + ' id=' + rohan.id + ' assigned=' + (rohan.assigned_to_name || 'none') : 'NOT FOUND'))
if (!rohan) process.exit(1)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
page.on('pageerror', (e) => trace('PAGEERROR: ' + e.message))
page.on('response', (r) => { const u = r.url().replace(B, ''); if (u.includes('/api/') && (r.request().method() !== 'GET' || u.includes('follow'))) trace(`RESP ${r.status()} ${r.request().method()} ${u}`) })

async function gotoSettled(url) {
  for (let i = 1; i <= 3; i++) {
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }); return }
    catch (e) {
      trace(`GOTO attempt ${i}: ${e.message.split('\n')[0]}`)
      if (i === 3 || !/ERR_ABORTED|ERR_EMPTY/.test(e.message)) throw e
      await page.waitForTimeout(1500)
    }
  }
}

// --- UI as priya
await gotoSettled(B + '/login')
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', 'priya@leadflow.local')
await page.fill('input[type="password"]', 'User@123')
await page.click('button[type="submit"]')
await page.waitForURL('**/app/dashboard', { timeout: 15000 })
await page.waitForTimeout(1500)

// open lead detail
await gotoSettled(B + '/app/leads/' + rohan.id)
await page.waitForTimeout(2000)
trace('lead detail url: ' + page.url().replace(B, ''))

// open Schedule Follow-up dialog
await page.click('button:has-text("Schedule Follow-up")')
await page.waitForTimeout(800)
await page.fill('input[name="title"]', 'Quarterly review call')
// today 16:00 IST (in future), reminder 10 minutes ago (past -> reminder notification fires)
const now = new Date(Date.now() - 10 * 60000)
const pad = (n) => String(n).padStart(2, '0')
const due = `2026-10-29T16:00`
const rem = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
await page.fill('input[name="due_at"]', due)
await page.fill('input[name="reminder_at"]', rem)
trace(`filling due_at=${due} reminder_at=${rem}`)
const post = page.waitForResponse((r) => r.url().includes('/api/follow-ups') && r.request().method() === 'POST')
await page.click('.MuiDialog-root button:has-text("Schedule Follow-up")')
const resp = await post
trace('follow-up POST -> ' + resp.status() + ' ' + JSON.stringify(await resp.json()).slice(0, 220))
await page.waitForTimeout(1200)

// --- Calendar
await gotoSettled(B + '/app/calendar')
await page.waitForTimeout(2000)
const calText = await page.textContent('body')
trace('calendar shows "Quarterly review call": ' + calText.includes('Quarterly review call'))
await page.screenshot({ path: 'scripts/ui-shots/detail-16-calendar-event.png' })

// --- Bell notifications
await page.click('[aria-label="Notifications"]')
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/ui-shots/detail-17-bell-reminders.png' })
const bellText = await page.textContent('body')
trace('bell has "Follow-up reminder": ' + bellText.includes('Follow-up reminder'))
trace('bell has "Follow-up due today": ' + bellText.includes('due today'))

// --- Notifications page
await page.click('nav >> text=Notifications')
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/ui-shots/detail-18-notifications-page.png' })
const notifText = await page.textContent('body')
trace('notifications page has reminder: ' + notifText.includes('Follow-up reminder'))

trace('== DONE')
await browser.close()
