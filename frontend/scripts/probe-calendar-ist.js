import { chromium } from 'playwright'
import fs from 'node:fs'
const B = 'http://localhost:5173'
fs.rmSync('scripts/ui-shots/trace-cal-ist.log', { force: true })
const trace = (m) => { console.log(m); fs.appendFileSync('scripts/ui-shots/trace-cal-ist.log', m + '\n') }

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
page.on('pageerror', (e) => trace('PAGEERROR: ' + e.message))
async function gotoSettled(url) {
  for (let i = 1; i <= 3; i++) {
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }); return }
    catch (e) {
      if (i === 3 || !/ERR_ABORTED|ERR_EMPTY/.test(e.message)) throw e
      await page.waitForTimeout(1500)
    }
  }
}
await gotoSettled(B + '/login')
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', 'priya@leadflow.local')
await page.fill('input[type="password"]', 'User@123')
await page.click('button[type="submit"]')
await page.waitForURL('**/app/dashboard', { timeout: 15000 })
await page.waitForTimeout(1500)
await gotoSettled(B + '/app/calendar')
await page.waitForTimeout(2500)
const txt = await page.textContent('body')
trace('shows "4:00 PM Quarterly review call": ' + txt.includes('4:00 PM') && txt.includes('Quarterly review call'))
trace('still shows "10:30 AM" (old bug): ' + txt.includes('10:30 AM'))
await page.screenshot({ path: 'scripts/ui-shots/detail-19-calendar-ist.png' })
trace('== DONE')
await browser.close()
