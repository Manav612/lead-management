import { chromium } from 'playwright'

const B = 'http://localhost:5173'
const API = 'http://localhost:3001'
const SHOT = (n) => `scripts/ui-shots/${n}.png`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
page.on('request', (req) => {
  if ((req.method() === 'PATCH' || req.method() === 'POST') && /\/api\/(leads|follow-ups|activities)/.test(req.url())) {
    console.log('NET', req.method(), '->', req.url().split('/api/')[1], JSON.stringify(req.postData() || {}))
  }
})
page.on('response', async (res) => {
  if ((res.request().method() === 'PATCH' || res.request().method() === 'POST') && /\/api\/(leads|follow-ups|activities)/.test(res.url())) {
    let body = ''
    try { body = (await res.text()).slice(0, 200) } catch {}
    console.log('NET', res.request().method(), '<-', res.status(), body)
  }
})
const dumpDialog = async (tag) => {
  const d = page.locator('.MuiDialog-root')
  if (await d.count()) {
    const errTexts = await d.locator('.Mui-error, .MuiFormHelperText-root, .MuiAlert-root').allTextContents()
    console.log(tag, 'DIALOG STILL OPEN. errors:', JSON.stringify(errTexts))
  } else console.log(tag, 'dialog closed')
}

// ---- API helper (ground truth + cleanup)
const login = await (await fetch(API + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@leadflow.local', password: 'Admin@123' })
})).json()
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token }
const apiGet = async (p) => (await (await fetch(API + p, { headers: H })).json())
const apiPatch = async (p, b) => (await (await fetch(API + p, { method: 'PATCH', headers: H, body: JSON.stringify(b) })).json())

const leads = await apiGet('/api/leads')
const lead = leads.rows.find((l) => l.lead_code !== 'LD-2026-000022') || leads.rows[0]
console.log('TARGET LEAD:', lead.lead_code, lead.name, 'status=', lead.status, 'id=', lead.id)
const origStatus = lead.status
const origNextFu = lead.next_follow_up_at

// ---- browser login
await page.goto(B + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
await page.waitForURL('**/admin/dashboard', { timeout: 15000 })
await page.goto(`${B}/admin/leads/${lead.id}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// ============ TEST 1: Change Status -> Contacted (design + function) ============
await page.locator('button', { hasText: 'Change Status' }).first().click()
await page.waitForTimeout(600)
await page.screenshot({ path: SHOT('detail-1-status-dialog'), fullPage: false })
const dlg = page.locator('.MuiDialog-root')
await dlg.locator('.MuiSelect-select').first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: SHOT('detail-2-status-options') })
await page.getByRole('option', { name: 'Contacted' }).click()
await page.waitForTimeout(200)
await dlg.locator('button', { hasText: 'Update Status' }).click()
await page.waitForTimeout(1800)
const t1 = (await apiGet('/api/leads/' + lead.id)).lead.status
console.log('TEST1 status after UI update (API ground truth):', t1, t1 === 'contacted' ? 'PASS' : 'FAIL')
console.log('TEST1 dialog closed:', (await dlg.count()) === 0 ? 'PASS' : 'FAIL')
await page.screenshot({ path: SHOT('detail-3-status-updated') })

// ============ TEST 2: new status "Pending for Doc" ============
await page.locator('button', { hasText: 'Change Status' }).first().click()
await page.waitForTimeout(500)
const dlg2 = page.locator('.MuiDialog-root')
await dlg2.locator('.MuiSelect-select').first().click()
await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Pending for Doc' }).click()
await page.waitForTimeout(200)
await dlg2.locator('button', { hasText: 'Update Status' }).click()
await page.waitForTimeout(1800)
const t2 = (await apiGet('/api/leads/' + lead.id)).lead.status
const chipText = (await page.locator('.MuiChip-root').allTextContents()).join(' | ')
console.log('TEST2 pending_doc (API):', t2, t2 === 'pending_doc' ? 'PASS' : 'FAIL', '| chips:', chipText)
await page.screenshot({ path: SHOT('detail-4-pending-doc') })

// ============ TEST 3: Add Remark (design + function) ============
await page.locator('button', { hasText: 'Add Remark' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: SHOT('detail-5-add-remark') })
const dlg3 = page.locator('.MuiDialog-root')
await dlg3.locator('input[name="subject"]').fill('Discussed pricing')
await dlg3.locator('textarea').first().fill('Client wants the annual plan, sending quote today.')
await dlg3.locator('input[name="outcome"]').fill('interested')
await page.screenshot({ path: SHOT('detail-6-add-remark-filled') })
const remarkRespP = page.waitForResponse((r) => r.url().includes('/activities') && r.request().method() === 'POST', { timeout: 8000 }).catch(() => null)
await dlg3.locator('button', { hasText: 'Save Remark' }).click()
const remarkResp = await remarkRespP
if (remarkResp) console.log('TEST3 remark POST ->', remarkResp.status(), (await remarkResp.text()).slice(0, 150))
else { console.log('TEST3 NO remark POST was made'); await dumpDialog('TEST3') }
await page.waitForTimeout(1200)
const acts = await apiGet(`/api/leads/${lead.id}/activities`)
const hasRemark = acts.rows.some((a) => a.subject === 'Discussed pricing')
console.log('TEST3 remark saved (API):', hasRemark ? 'PASS' : 'FAIL', '| activities for lead:', acts.rows.length, '| subjects:', JSON.stringify(acts.rows.slice(0, 5).map((a) => a.subject)))
await page.screenshot({ path: SHOT('detail-7-remark-in-timeline') })

// ============ TEST 4: Schedule Follow-up (design + function) ============
await page.locator('button', { hasText: 'Schedule Follow-up' }).nth(1).click()
await page.waitForTimeout(600)
await page.screenshot({ path: SHOT('detail-8-schedule-fu'), fullPage: false })
const dlg4 = page.locator('.MuiDialog-root')
await dlg4.locator('input[name="title"]').fill('Demo walkthrough')
await dlg4.locator('input[name="due_at"]').fill('2026-10-30T11:30')
await dlg4.locator('textarea').first().fill('Show the dashboard and reports')
await page.screenshot({ path: SHOT('detail-9-schedule-fu-filled') })

// TEST 4b: validation specificity — clear title and submit, expect inline "Title is required"
await dlg4.locator('input[name="title"]').fill('')
await dlg4.locator('button', { hasText: 'Schedule Follow-up' }).last().click()
await page.waitForTimeout(800)
const inlineErr = await dlg4.locator('.Mui-error, .MuiFormHelperText-root').allTextContents()
console.log('TEST4b inline validation shown:', JSON.stringify(inlineErr))
await page.screenshot({ path: SHOT('detail-10-validation-error') })
await dlg4.locator('input[name="title"]').fill('Demo walkthrough')

const fuRespP = page.waitForResponse((r) => r.url().includes('/api/follow-ups') && r.request().method() === 'POST', { timeout: 8000 }).catch(() => null)
await dlg4.locator('button', { hasText: 'Schedule Follow-up' }).last().click()
const fuResp = await fuRespP
if (fuResp) console.log('TEST4 follow-up POST ->', fuResp.status(), (await fuResp.text()).slice(0, 150))
else { console.log('TEST4 NO follow-up POST was made'); await dumpDialog('TEST4') }
await page.waitForTimeout(1200)
const fu = await apiGet(`/api/follow-ups?lead_id=${lead.id}`)
const hasFu = fu.rows.some((f) => f.title === 'Demo walkthrough')
console.log('TEST4 follow-up created (API):', hasFu ? 'PASS' : 'FAIL', '| fu rows:', fu.rows.length)
// switch to Follow-ups tab
await page.locator('button[role="tab"]', { hasText: /Follow-ups/ }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: SHOT('detail-11-fu-list') })

// ============ TEST 5: specific API-level validation toast ============
// client zod has no max on subject; API rejects >200 -> toast must show the detail
await page.locator('button', { hasText: 'Add Remark' }).click()
await page.waitForTimeout(600)
const dlg5 = page.locator('.MuiDialog-root')
await dlg5.locator('input[name="subject"]').fill('X'.repeat(250))
await dlg5.locator('button', { hasText: 'Save Remark' }).click()
await page.waitForTimeout(1500)
const bodyText = await page.textContent('body')
const toastShown = bodyText.includes('Validation failed') && /subject:/.test(bodyText)
console.log('TEST5 specific API toast:', toastShown ? 'PASS' : 'FAIL')
const m = bodyText.match(/Validation failed[^]{0,140}/)
if (m) console.log('  toast text:', JSON.stringify(m[0].replace(/\s+/g, ' ').slice(0, 160)))
await page.screenshot({ path: SHOT('detail-12-specific-toast') })
// also verify the close X icon on the still-open dialog
await dlg5.locator('button[aria-label="Close"]').first().click()
await page.waitForTimeout(600)
console.log('TEST5 dialog closed via X icon:', (await page.locator('.MuiDialog-root').count()) === 0 ? 'PASS' : 'FAIL')

// ============ CLEANUP: restore demo data ============
await apiPatch('/api/leads/' + lead.id, { status: origStatus, loss_reason: null })
const createdFu = fu.rows.find((f) => f.title === 'Demo walkthrough')
if (createdFu) await apiPatch(`/api/follow-ups/${createdFu.id}`, { status: 'cancelled' })
const testAct = (await apiGet(`/api/leads/${lead.id}/activities`)).rows.find((a) => a.subject === 'Discussed pricing')
console.log('CLEANUP done (status restored to', origStatus + ', follow-up cancelled)')

console.log('ERRORS:', errors.length ? errors : 'none')
await browser.close()
process.exit(errors.length ? 2 : 0)
