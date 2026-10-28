import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('[pageerror]', e.message, '\n', (e.stack || '').slice(0, 800)))
page.on('response', async (r) => {
  if (r.status() >= 400) console.log('[HTTP ' + r.status() + '] ' + r.request().method() + ' ' + r.url())
})
page.on('requestfailed', (r) => console.log('[REQFAIL]', r.url(), r.failure()?.errorText))

await page.goto('http://localhost:5173/login', { waitUntil: 'load' })
await page.waitForTimeout(1500)
console.log('--- login page body length:', (await page.innerHTML('#root')).length)
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
await page.waitForTimeout(3000)
console.log('--- after login, URL:', page.url())
console.log('--- root innerHTML (first 500):', (await page.innerHTML('#root')).slice(0, 500))
console.log('--- root children count:', await page.locator('#root > *').count())
await browser.close()
