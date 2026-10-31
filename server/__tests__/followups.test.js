import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { newApp, demoUsers, authHeader } from './helpers.js'

const nowIso = () => new Date().toISOString()
const soon = (mins) => new Date(Date.now() + mins * 60000).toISOString()
const past = (mins) => new Date(Date.now() - mins * 60000).toISOString()

async function makeLead(app, user, phone) {
  const res = await request(app)
    .post('/api/leads').set(authHeader(user))
    .send({ name: `FU Lead ${phone}`, phone })
  return res.body.lead
}

describe('follow-ups', () => {
  it('user can create a follow-up on their own lead', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const lead = await makeLead(app, priya, '+91 98666 10101')
    const res = await request(app)
      .post('/api/follow-ups').set(authHeader(priya))
      .send({ lead_id: lead.id, title: 'Call about pricing', follow_up_type: 'call', due_at: soon(120) })
    expect(res.status).toBe(201)
    expect(res.body.follow_up.status).toBe('pending')
    expect(res.body.follow_up.assigned_to).toBe(priya.id)
  })

  it('user cannot create a follow-up on someone else\'s lead', async () => {
    const { app, store } = newApp()
    const { priya, arjun } = await demoUsers(store)
    const lead = await makeLead(app, priya, '+91 98666 20202')
    const res = await request(app)
      .post('/api/follow-ups').set(authHeader(arjun))
      .send({ lead_id: lead.id, title: 'Sneaky', follow_up_type: 'call', due_at: soon(60) })
    expect(res.status).toBe(404)
  })

  it('completing a follow-up marks it done and chains the next one', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const lead = await makeLead(app, priya, '+91 98666 30303')
    const created = await request(app)
      .post('/api/follow-ups').set(authHeader(priya))
      .send({ lead_id: lead.id, title: 'First touch', follow_up_type: 'call', due_at: past(60) })
    const fu = created.body.follow_up

    const done = await request(app)
      .post(`/api/follow-ups/${fu.id}/complete`).set(authHeader(priya))
      .send({ outcome: 'Interested', next_follow_up_at: soon(24 * 60) })
    expect(done.status).toBe(200)
    expect(done.body.follow_up.status).toBe('completed')
    expect(done.body.follow_up.outcome).toBe('Interested')

    // next follow-up should exist and be pending
    const list = await request(app)
      .get(`/api/follow-ups?lead_id=${lead.id}&pageSize=50`).set(authHeader(priya))
    expect(list.status).toBe(200)
    const pending = list.body.rows.filter((f) => f.status === 'pending')
    expect(pending.length).toBe(1)
    expect(pending[0].title).toContain('First touch')
  })

  it('completing twice → 409', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const lead = await makeLead(app, priya, '+91 98666 40404')
    const created = await request(app)
      .post('/api/follow-ups').set(authHeader(priya))
      .send({ lead_id: lead.id, title: 'Once', follow_up_type: 'email', due_at: past(30) })
    const fu = created.body.follow_up
    await request(app).post(`/api/follow-ups/${fu.id}/complete`).set(authHeader(priya)).send({})
    const again = await request(app)
      .post(`/api/follow-ups/${fu.id}/complete`).set(authHeader(priya)).send({})
    expect(again.status).toBe(409)
  })

  it('tabs: overdue and today filter correctly', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const lead = await makeLead(app, priya, '+91 98666 50505')
    await request(app)
      .post('/api/follow-ups').set(authHeader(priya))
      .send({ lead_id: lead.id, title: 'Overdue one', follow_up_type: 'call', due_at: past(60 * 24) })
    const overdue = await request(app)
      .get('/api/follow-ups?tab=overdue').set(authHeader(priya))
    expect(overdue.status).toBe(200)
    expect(overdue.body.rows.some((f) => f.title === 'Overdue one')).toBe(true)
  })

  it('admin sees all follow-ups, user only own', async () => {
    const { app, store } = newApp()
    const { admin, priya, arjun } = await demoUsers(store)
    const l1 = await makeLead(app, priya, '+91 98666 60606')
    const l2 = await makeLead(app, arjun, '+91 98666 70707')
    await request(app).post('/api/follow-ups').set(authHeader(priya))
      .send({ lead_id: l1.id, title: 'P lead', follow_up_type: 'call', due_at: soon(30) })
    await request(app).post('/api/follow-ups').set(authHeader(arjun))
      .send({ lead_id: l2.id, title: 'A lead', follow_up_type: 'call', due_at: soon(45) })

    // priya also has seeded follow-ups, so scope = her own only (never arjun's)
    const asPriya = await request(app).get('/api/follow-ups?pageSize=100').set(authHeader(priya))
    expect(asPriya.body.rows.every((f) => f.assigned_to === priya.id)).toBe(true)
    expect(asPriya.body.rows.some((f) => f.title === 'P lead')).toBe(true)
    expect(asPriya.body.rows.some((f) => f.title === 'A lead')).toBe(false)

    const asAdmin = await request(app).get('/api/follow-ups?pageSize=100').set(authHeader(admin))
    expect(asAdmin.body.rows.some((f) => f.title === 'P lead')).toBe(true)
    expect(asAdmin.body.rows.some((f) => f.title === 'A lead')).toBe(true)
  })
})
