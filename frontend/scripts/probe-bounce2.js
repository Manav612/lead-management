import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
const ev = []
page.on('framenavigated', (f) => ev.push(`NAV ${f.url().replace(B, '')}`))
page.on('response', (r) => {
  const u = r.url().replace(B, '')
  if (u.includes('/api/')) ev.push(`RESP ${r.status()} ${u}`)
})

await page.goto(B + '/login', { waitUntil: 'networkidle' })
ev.push('--- login page loaded')
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
ev.push('--- submit clicked')
await page.waitForURL('**/admin/dashboard')
ev.push('--- at dashboard, token=' + await page.evaluate(() => Boolean(localStorage.getItem('leadflow_token'))))
await page.goto(B + '/admin/leads/new', { waitUntil: 'networkidle' }).catch((e) => ev.push('GOTO ERR: ' + e.message.split('\n')[0]))
ev.push('--- after goto: url=' + page.url().replace(B, '') + ' token=' + await page.evaluate(() => Boolean(localStorage.getItem('leadflow_token'))))
await page.waitForTimeout(1500)
ev.push('--- +1.5s: url=' + page.url().replace(B, '') + ' token=' + await page.evaluate(() => Boolean(localStorage.getItem('leadflow_token'))))
console.log(ev.join('\n'))
await browser.close()
