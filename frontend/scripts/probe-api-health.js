const B = 'http://localhost:3001'
const health = await fetch(B + '/api/health').then((r) => r.json()).catch((e) => ({ down: e.message }))
console.log('health:', JSON.stringify(health))
const login = await fetch(B + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@leadflow.local', password: 'Admin@123' })
}).then((r) => r.json())
console.log('login ok:', Boolean(login.token))
const me = await fetch(B + '/api/me', { headers: { Authorization: 'Bearer ' + login.token } })
console.log('/api/me with fresh token:', me.status)
await new Promise((r) => setTimeout(r, 4000))
const me2 = await fetch(B + '/api/me', { headers: { Authorization: 'Bearer ' + login.token } })
console.log('/api/me after 4s:', me2.status)
