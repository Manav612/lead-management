import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })

// login
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
await page.waitForURL('**/admin/dashboard', { timeout: 15000 })
console.log('Logged in at', page.url())

// import flow
await page.goto('http://localhost:5173/admin/import', { waitUntil: 'networkidle' })
await page.setInputFiles('input[type="file"]', path.join(__dirname, '..', '..', 'sample-leads.xlsx'))
await page.waitForTimeout(3500) // validate step
await page.screenshot({ path: path.join(__dirname, 'ui-shots', 'import-step2.png'), fullPage: true })
const step2 = (await page.textContent('body'))?.slice(0, 400)
console.log('STEP2 body:', step2.replace(/\s+/g, ' '))

// confirm import
const confirmBtn = page.locator('button', { hasText: /Import \d+ Leads/ }).first()
if (await confirmBtn.count()) {
  await confirmBtn.click()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: path.join(__dirname, 'ui-shots', 'import-step3.png'), fullPage: true })
  const step3 = (await page.textContent('body'))?.slice(0, 500)
  console.log('STEP3 body:', step3.replace(/\s+/g, ' '))
} else {
  console.log('NO CONFIRM BUTTON FOUND')
}

// check Import History
await page.goto('http://localhost:5173/admin/import/history', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(__dirname, 'ui-shots', 'import-history.png'), fullPage: true })

console.log('ERRORS:', errors.length ? errors : 'none')
await browser.close()
process.exit(errors.length ? 2 : 0)
