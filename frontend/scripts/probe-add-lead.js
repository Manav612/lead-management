import { chromium } from 'playwright'
import fs from 'node:fs'
const B = 'http://localhost:5173'
const LOG = 'scripts/ui-shots/trace.log'
fs.rmSync(LOG, { force: true })
const trace = (msg) => { console.log(msg); fs.appendFileSync(LOG, msg + '\n') }

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
const errors = []
page.on('pageerror', (e) => trace('PAGEERROR: ' + e.message))
page.on('response', (r) => { const u = r.url().replace(B, ''); if (u.includes('/api/')) trace(`RESP ${r.status()} ${u}`) })
page.on('framenavigated', (f) => trace(`NAV ${f.url().replace(B, '')}`))
page.on('console', (m) => { const t = m.text(); if (t.includes('[vite]') || t.toLowerCase().includes('reload')) trace(`VITE: ${t.slice(0, 140)}`) })

async function tok() { try { return await page.evaluate(() => Boolean(localStorage.getItem('leadflow_token'))) } catch { return 'n/a' } }

async function gotoSettled(url) {
  for (let i = 1; i <= 3; i++) {
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }); return }
    catch (e) {
      trace(`GOTO attempt ${i} failed: ${e.message.split('\n')[0]}`)
      if (i === 3 || !/ERR_ABORTED|ERR_EMPTY/.test(e.message)) throw e
      await page.waitForTimeout(1500)
    }
  }
}

trace('== step 1: login page')
await gotoSettled(B + '/login')
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
await page.waitForURL('**/admin/dashboard', { timeout: 15000 }).catch((e) => trace('waitForURL: ' + e.message.split('\n')[0]))
await page.waitForTimeout(2000)
trace(`after login: url=${page.url().replace(B, '')} token=${await tok()}`)

trace('== step 2: /admin/leads/new')
await gotoSettled(B + '/admin/leads/new')
await page.waitForTimeout(2500)
trace(`after goto: url=${page.url().replace(B, '')} token=${await tok()}`)
const bodyLen = (await page.textContent('body'))?.trim().length ?? 0
trace(`body chars: ${bodyLen}`)
if (page.url().includes('/login')) trace('BOUNCED TO LOGIN!')

if (!page.url().includes('/admin/leads/new')) {
  trace('RESULT: FAIL - not on add-lead page')
  await browser.close()
  process.exit(1)
}
await page.screenshot({ path: 'scripts/ui-shots/detail-13-add-lead-page.png' })
trace('== step 3: fill + create')
await page.fill('input[name="name"]', 'Rohan Gupta')
await page.fill('input[name="company_name"]', 'Gupta Industries')
await page.fill('input[name="phone"]', '+919870012345')
await page.fill('input[name="email"]', 'rohan@gupta-ind.in')
await page.fill('input[name="city"]', 'Pune')
const post = page.waitForResponse((r) => r.url().includes('/api/leads') && r.request().method() === 'POST')
await page.click('button:has-text("Create Lead")')
const resp = await post
trace(`create POST /api/leads -> ${resp.status()}`)
await page.waitForURL('**/admin/leads/**', { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(1500)
trace(`navigated to: ${page.url().replace(B, '')}`)
await page.screenshot({ path: 'scripts/ui-shots/detail-14-created-lead-detail.png' })

trace('== step 4: user role /app/leads/new')
await gotoSettled(B + '/login')
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', 'priya@leadflow.local')
await page.fill('input[type="password"]', 'User@123')
await page.click('button[type="submit"]')
await page.waitForURL('**/app/dashboard', { timeout: 15000 }).catch((e) => trace('waitForURL: ' + e.message.split('\n')[0]))
await page.waitForTimeout(2000)
await gotoSettled(B + '/app/leads/new')
await page.waitForTimeout(2500)
trace(`user add-lead url: ${page.url().replace(B, '')} token=${await tok()}`)
const bodyLen2 = (await page.textContent('body'))?.trim().length ?? 0
trace(`user body chars: ${bodyLen2}`)
await page.screenshot({ path: 'scripts/ui-shots/detail-15-user-add-lead.png' })

trace('== pageerrors: ' + (errors.length ? errors.join(' | ') : 'none'))
trace('== RESULT: ' + (page.url().includes('/app/leads/new') ? 'PASS' : 'CHECK'))
await browser.close()
