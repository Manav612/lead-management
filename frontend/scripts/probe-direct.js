import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[console.' + m.type() + ']', m.text().slice(0, 250)) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n')[1] || ''))
page.on('response', (r) => { if (r.status() >= 400) console.log('[HTTP ' + r.status() + ']', r.url()) })

// 1) Get a token via API
const login = await (await ctx.request.post('http://localhost:5173/api/auth/login', {
  data: { email: 'admin@leadflow.local', password: 'Admin@123' }
})).json()
await ctx.addInitScript((tok) => localStorage.setItem('leadflow_token', tok), login.token)

// 2) Fresh load of /admin/dashboard with token pre-seeded
await page.goto('http://localhost:5173/admin/dashboard', { waitUntil: 'load' })
await page.waitForTimeout(2500)
const c1 = await page.locator('#root > *').count()
console.log('DIRECT LOAD /admin/dashboard  root children:', c1, ' url:', page.url())
await page.screenshot({ path: 'scripts/ui-shots/direct-admin.png', fullPage: true })

// 3) Also try /login then the SPA nav
await page.goto('http://localhost:5173/app/dashboard', { waitUntil: 'load' })
await page.waitForTimeout(2500)
const c2 = await page.locator('#root > *').count()
console.log('DIRECT LOAD /app/dashboard (as admin)  root children:', c2, ' url:', page.url())

await browser.close()
