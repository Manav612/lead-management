import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text().slice(0, 200)))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto('http://localhost:5173/login', { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.fill('input[type="email"]', 'admin@leadflow.local')
await page.fill('input[type="password"]', 'Admin@123')
await page.click('button[type="submit"]')
await page.waitForTimeout(3000)

const info = await page.evaluate(async () => {
  const root = document.getElementById('root')
  const token = localStorage.getItem('leadflow_token')
  let meStatus = null, meBody = null
  if (token) {
    const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
    meStatus = r.status
    meBody = (await r.text()).slice(0, 200)
  }
  return {
    url: location.href,
    rootExists: !!root,
    rootOuter: root ? root.outerHTML.slice(0, 300) : null,
    rootChildCount: root ? root.children.length : -1,
    token: token ? token.slice(0, 30) + '... (len ' + token.length + ')' : null,
    meStatus, meBody,
    docTitle: document.title,
    docLen: document.documentElement.outerHTML.length
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
