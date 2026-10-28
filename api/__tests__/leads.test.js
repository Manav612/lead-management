import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { newApp, demoUsers, authHeader } from './helpers.js'

describe('lead rules', () => {
  it('user-created lead is auto-assigned to the creator', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const res = await request(app)
      .post('/api/leads')
      .set(authHeader(priya))
      .send({ name: 'Test Customer', phone: '+91 98111 22233', email: 'tc@example.com', priority: 'high' })
    expect(res.status).toBe(201)
    expect(res.body.lead.assigned_to).toBe(priya.id)
    expect(res.body.lead.status).toBe('new')
    expect(res.body.lead.lead_code).toMatch(/^LD-\d{4}-\d{6}$/)
  })

  it('user cannot assign a new lead to someone else (403)', async () => {
    const { app, store } = newApp()
    const { priya, arjun } = await demoUsers(store)
    const res = await request(app)
      .post('/api/leads')
      .set(authHeader(priya))
      .send({ name: 'Someone Else', phone: '+91 98111 44455', assigned_to: arjun.id })
    expect(res.status).toBe(403)
  })

  it('user cannot view another user\'s lead (404)', async () => {
    const { app, store } = newApp()
    const { priya, arjun } = await demoUsers(store)
    const created = await request(app)
      .post('/api/leads').set(authHeader(priya))
      .send({ name: 'Priya Lead', phone: '+91 98222 55566' })
    const other = await request(app)
      .get(`/api/leads/${created.body.lead.id}`).set(authHeader(arjun))
    expect(other.status).toBe(404)
  })

  it('admin can see any lead and reassign it', async () => {
    const { app, store } = newApp()
    const { admin, priya, arjun } = await demoUsers(store)
    const created = await request(app)
      .post('/api/leads').set(authHeader(priya))
      .send({ name: 'Reassign Me', phone: '+91 98333 77788' })
    const leadId = created.body.lead.id

    const seen = await request(app).get(`/api/leads/${leadId}`).set(authHeader(admin))
    expect(seen.status).toBe(200)

    const reassign = await request(app)
      .patch(`/api/leads/${leadId}`).set(authHeader(admin))
      .send({ assigned_to: arjun.id })
    expect(reassign.status).toBe(200)
    expect(reassign.body.lead.assigned_to).toBe(arjun.id)
  })

  it('setting status to lost requires loss_reason (400)', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const created = await request(app)
      .post('/api/leads').set(authHeader(priya))
      .send({ name: 'Will Lose', phone: '+91 98444 99900' })
    const noReason = await request(app)
      .patch(`/api/leads/${created.body.lead.id}`).set(authHeader(priya))
      .send({ status: 'lost' })
    expect(noReason.status).toBe(400)

    const withReason = await request(app)
      .patch(`/api/leads/${created.body.lead.id}`).set(authHeader(priya))
      .send({ status: 'lost', loss_reason: 'Too expensive' })
    expect(withReason.status).toBe(200)
    expect(withReason.body.lead.status).toBe('lost')
    expect(withReason.body.lead.loss_reason).toBe('Too expensive')
  })

  it('status change writes status history', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const created = await request(app)
      .post('/api/leads').set(authHeader(priya))
      .send({ name: 'History Lead', phone: '+91 98555 11122' })
    const leadId = created.body.lead.id
    await request(app)
      .patch(`/api/leads/${leadId}`).set(authHeader(priya))
      .send({ status: 'contacted' })
    const hist = await request(app)
      .get(`/api/leads/${leadId}/status-history`).set(authHeader(priya))
    expect(hist.status).toBe(200)
    expect(hist.body.rows.length).toBeGreaterThanOrEqual(1)
    expect(hist.body.rows[0].new_status).toBe('contacted')
  })

  it('invalid lead payload → 400 validation error', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const res = await request(app)
      .post('/api/leads').set(authHeader(priya))
      .send({ name: '', phone: '123' })
    expect(res.status).toBe(400)
  })
})
