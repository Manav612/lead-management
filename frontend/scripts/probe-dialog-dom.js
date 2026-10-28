import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
await page.waitForURL('**/admin/dashboard')
const leadId = await page.evaluate(async () => {
  const token = localStorage.getItem('leadflow_token')
  const r = await fetch('/api/leads', { headers: { Authorization: 'Bearer ' + token } })
  const d = await r.json()
  return d.rows[0].id
})
await page.goto('http://localhost:5173/admin/leads/' + leadId, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const dumpInputs = (label) => page.evaluate((label) => {
  const inputs = Array.from(document.querySelectorAll('.MuiDialog-root input')).map((el, i) => ({
    i, name: el.name || null, type: el.type || 'text',
    labelled: (el.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent).filter(Boolean).join(' | ') || null
  }))
  const areas = Array.from(document.querySelectorAll('.MuiDialog-root textarea')).map((el, i) => ({
    i, labelled: (el.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent).filter(Boolean).join(' | ') || null
  }))
  return { label, inputs, areas }
}, label)

await page.locator('button', { hasText: 'Add Remark' }).click()
await page.waitForTimeout(800)
console.log(JSON.stringify(await dumpInputs('ADD REMARK'), null, 1))

await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await page.locator('button', { hasText: 'Schedule Follow-up' }).nth(1).click()
await page.waitForTimeout(800)
console.log(JSON.stringify(await dumpInputs('SCHEDULE FU'), null, 1))

await browser.close()
