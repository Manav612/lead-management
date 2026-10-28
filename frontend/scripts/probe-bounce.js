import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
const ev = []
page.on('framenavigated', (f) => ev.push(`NAV ${f.url().replace(B, '')} @${Date.now()}`))
page.on('pageerror', (e) => ev.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') ev.push('console: ' + m.text().slice(0, 160)) })

await page.goto(B + '/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
await page.waitForTimeout(4000)
ev.push('after login: url=' + page.url() + ' token=' + (await page.evaluate(() => Boolean(localStorage.getItem('leadflow_token')))))

await page.goto(B + '/admin/leads/new', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
ev.push('after goto new: url=' + page.url() + ' token=' + (await page.evaluate(() => Boolean(localStorage.getItem('leadflow_token')))))

console.log(ev.join('\n'))
await page.screenshot({ path: 'scripts/ui-shots/debug-add-lead-2.png' })
await browser.close()
