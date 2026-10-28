import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { newApp, demoUsers, authHeader } from './helpers.js'

describe('health & auth basics', () => {
  it('GET /api/health returns ok with local-dev mode', async () => {
    const { app } = newApp()
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.mode).toBe('local-dev')
  })

  it('login with wrong password fails with 401', async () => {
    const { app } = newApp()
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@leadflow.local', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('login with demo admin succeeds and returns a token', async () => {
    const { app } = newApp()
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@leadflow.local', password: 'Admin@123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.role).toBe('admin')
  })

  it('GET /api/me without token → 401, with token → user', async () => {
    const { app, store } = newApp()
    const { admin } = await demoUsers(store)

    const noAuth = await request(app).get('/api/me')
    expect(noAuth.status).toBe(401)

    const me = await request(app).get('/api/me').set(authHeader(admin))
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe('admin@leadflow.local')
    expect(me.body.user.role).toBe('admin')
  })

  it('a user cannot access admin endpoints (403)', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const res = await request(app).get('/api/users').set(authHeader(priya))
    expect(res.status).toBe(403)
  })

  it('deactivated user is rejected at auth (403)', async () => {
    const { app, store } = newApp()
    const { arjun } = await demoUsers(store)
    await store.profiles.updateProfile(arjun.id, { is_active: false })
    const res = await request(app).get('/api/me').set(authHeader(arjun))
    expect(res.status).toBe(403)
  })

  it('tampered token is rejected (401)', async () => {
    const { app, store } = newApp()
    const { admin } = await demoUsers(store)
    const token = (await request(app).post('/api/auth/login').send({ email: 'admin@leadflow.local', password: 'Admin@123' })).body.token
    const tampered = token.slice(0, -2) + 'xx'
    const res = await request(app).get('/api/me').set({ Authorization: `Bearer ${tampered}` })
    expect(res.status).toBe(401)
  })
})
