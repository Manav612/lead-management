// one-off: reset demo data touched by tests back to seed values
const B = 'http://localhost:3001'
const login = await (await fetch(B + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@leadflow.local', password: 'Admin@123' })
})).json()
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token }
const leads = await (await fetch(B + '/api/leads', { headers: H })).json()
const tarun = leads.rows.find((l) => l.lead_code === 'LD-2026-000021')
if (tarun.status !== 'new') {
  const r = await fetch(B + '/api/leads/' + tarun.id, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'new', loss_reason: null }) })
  console.log('Tarun Mehta status -> new:', r.status)
} else console.log('Tarun Mehta already new')
// show any remaining non-cancelled follow-ups created by tests
const fus = await (await fetch(B + '/api/follow-ups', { headers: H })).json()
const odd = fus.rows.filter((f) => f.title === 'Demo walkthrough' && f.status !== 'cancelled')
console.log('leftover active test follow-ups:', odd.length)
