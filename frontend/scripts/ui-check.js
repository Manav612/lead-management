/**
 * Headless browser smoke test for LeadFlow (uses local-dev mode on :5173).
 * Usage: node scripts/ui-check.js [admin|user]
 * Captures console errors + pageerrors and screenshots each route.
 */
import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const role = process.argv[2] || 'admin'
const creds = role === 'admin'
  ? { email: 'admin@leadflow.local', password: 'Admin@123', routes: ['/admin/dashboard', '/admin/leads', '/admin/import', '/admin/follow-ups', '/admin/reports', '/admin/users', '/admin/settings', '/admin/import/history'] }
  : { email: 'priya@leadflow.local', password: 'User@123', routes: ['/app/dashboard', '/app/leads', '/app/follow-ups', '/app/calendar', '/app/notifications', '/app/profile'] }

const errors = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()) })
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message))

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', creds.email)
await page.fill('input[type="password"]', creds.password)
await page.click('button[type="submit"]')
await page.waitForTimeout(2500)

const shotDir = path.join(__dirname, 'ui-shots')
import('fs').then(async (fs) => {
  fs.mkdirSync(shotDir, { recursive: true })

  console.log('After login, URL =', page.url())
  await page.screenshot({ path: path.join(shotDir, '00-login-redirect.png'), fullPage: true })

  for (const route of creds.routes) {
    await page.goto('http://localhost:5173' + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    const name = route.replace(/\//g, '_').replace(/^_/, '')
    await page.screenshot({ path: path.join(shotDir, name + '.png'), fullPage: true })
    const bodyText = (await page.textContent('body'))?.trim().slice(0, 120)
    console.log(`ROUTE ${route}  url=${page.url()}  body="${bodyText}"`)
  }

  console.log('\n=== ERRORS (' + errors.length + ') ===')
  errors.forEach((e) => console.log(e))
  await browser.close()
  process.exit(errors.length ? 2 : 0)
})
