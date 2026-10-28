import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { newApp, demoUsers, authHeader } from './helpers.js'
import {
  parseWorkbook, validateImportRow, detectDuplicates, TEMPLATE_HEADERS, buildCsvTemplate, buildXlsxTemplate
} from '../services/importService.js'

const csvBuffer = (rows) =>
  Buffer.from([TEMPLATE_HEADERS.join(','), ...rows].join('\n'), 'utf8')

// pipeline: parse workbook → validate each raw row → duplicate detection
function pipeline(buf, filename, existing = []) {
  const { rows } = parseWorkbook(buf, filename, { maxRows: 10 })
  const results = rows.map((r) => {
    const { data, errors } = validateImportRow(r.raw)
    return { ...r, data, errors, status: errors.length ? 'invalid' : 'valid' }
  })
  detectDuplicates(results, existing)
  return results
}

describe('import: parsing & validation', () => {
  it('parses a CSV with the template headers and normalizes values', () => {
    const buf = csvBuffer([
      'Alice Kumar,Acme Corp,+91 98000 11111,alice@acme.in,Mumbai,Website,Annual Plan,150000,high,First met at expo',
      'Bob Verma,Bob & Sons,+91 98000 22222,bob@bobs.in,Delhi,Referral,Starter,50000,low,'
    ])
    const rows = pipeline(buf, 'leads.csv')
    expect(rows).toHaveLength(2)
    expect(rows[0].data.name).toBe('Alice Kumar')
    expect(rows[0].data.phone).toBe('+919800011111')
    expect(rows[0].data.estimated_deal_value).toBe(150000)
    expect(rows[0].data.priority).toBe('high')
    expect(rows[0].status).toBe('valid')
    expect(rows[1].data.priority).toBe('low')
    expect(rows[1].status).toBe('valid')
  })

  it('rejects files with missing required headers', () => {
    const bad = Buffer.from('Name,Phone\nAlice,123\n', 'utf8')
    expect(() => parseWorkbook(bad, 'bad.csv', { maxRows: 10 })).toThrow(/Header row not found/)
  })

  it('flags invalid rows (missing name/phone, bad email, negative value)', () => {
    const rows = pipeline(csvBuffer([
      ',NoName,+91 98000 33333',
      'NoPhone,C,,+bad email,,,,-5,high,',
      'Valid,Inc,+91 98000 44444,valid@inc.in,,Referral,Service,1000,medium,ok'
    ]), 'mix.csv')
    expect(rows[0].errors).toContain('Lead Name is required')
    expect(rows[1].errors).toContain('Phone Number is required')
    expect(rows[1].errors.some((e) => e.startsWith('Invalid email'))).toBe(true)
    expect(rows[1].errors.some((e) => e.includes('non-negative'))).toBe(true)
    expect(rows[2].errors).toHaveLength(0)
  })

  it('detects duplicates against existing leads and within the file', () => {
    const existing = [{ lead_code: 'LD-1', name: 'Old Lead', phone: '+919870055555', email: 'dup@dup.in' }]
    const out = pipeline(csvBuffer([
      'Dup One,DupCo,+91 98700 55555,dup@dup.in,,,5000,medium,',
      'Dup Two,Other,+91 98700 55555,,,Delhi,,1000,low,',
      'Unique,UniqueCo,+91 98700 66666,,,Pune,,2000,high,'
    ]), 'dups.csv', existing)
    expect(out.filter((r) => r.duplicate)).toHaveLength(2)
    expect(out[2].duplicate).toBeFalsy()
    expect(out[0].duplicate_reasons.some((m) => m.includes('LD-1'))).toBe(true)
  })
})

describe('import: full HTTP flow (validate → confirm → idempotent)', () => {
  it('validates, confirms, and is idempotent on re-confirm (409)', async () => {
    const { app, store } = newApp()
    const { admin } = await demoUsers(store)
    const buf = csvBuffer([
      'Import Alpha,Alpha Ltd,+91 99000 00001,alpha@alpha.in,Mumbai,Website,Pro,250000,high,from test',
      'Import Beta,Beta Ltd,+91 99000 00002,beta@beta.in,Delhi,Event,Starter,75000,medium,'
    ])

    const v = await request(app)
      .post('/api/imports/validate').set(authHeader(admin))
      .attach('file', buf, 'import-test.csv')
    expect(v.status).toBe(200)
    expect(v.body.summary.total_rows).toBe(2)
    expect(v.body.summary.valid_rows).toBe(2)
    expect(v.body.payload).toBeTruthy()
    expect(v.body.signature).toBeTruthy()

    const c = await request(app)
      .post('/api/imports/confirm').set(authHeader(admin))
      .send({ payload: v.body.payload, signature: v.body.signature, include_duplicates: false })
    expect(c.status).toBe(201)
    expect(c.body.batch.imported_rows).toBe(2)

    const again = await request(app)
      .post('/api/imports/confirm').set(authHeader(admin))
      .send({ payload: v.body.payload, signature: v.body.signature, include_duplicates: false })
    expect(again.status).toBe(409)
    expect(again.body.batch).toBeTruthy()

    // leads actually exist and are queryable
    const leads = await request(app)
      .get('/api/leads?q=Import+Alpha&pageSize=10').set(authHeader(admin))
    expect(leads.status).toBe(200)
    expect(leads.body.rows.some((l) => l.name === 'Import Alpha')).toBe(true)
  })

  it('rejects a tampered signature (400)', async () => {
    const { app, store } = newApp()
    const { admin } = await demoUsers(store)
    const buf = csvBuffer(['Sig Tamper,TamperCo,+91 99000 12121,t@t.in,,,100,low,'])
    const v = await request(app)
      .post('/api/imports/validate').set(authHeader(admin))
      .attach('file', buf, 'sig.csv')
    expect(v.status).toBe(200)
    const c = await request(app)
      .post('/api/imports/confirm').set(authHeader(admin))
      .send({ payload: v.body.payload, signature: v.body.signature + 'zz', include_duplicates: false })
    expect(c.status).toBe(400)
  })

  it('invalid rows are skipped with an error report; valid rows still import', async () => {
    const { app, store } = newApp()
    const { admin } = await demoUsers(store)
    const buf = csvBuffer([
      'Good Row,GoodCo,+91 99000 34343,g@g.in,,,,300,medium,',
      ',MissingName,+91 99000 34344'
    ])
    const v = await request(app)
      .post('/api/imports/validate').set(authHeader(admin))
      .attach('file', buf, 'mixed.csv')
    expect(v.body.summary.valid_rows).toBe(1)
    expect(v.body.summary.invalid_rows).toBe(1)

    const c = await request(app)
      .post('/api/imports/confirm').set(authHeader(admin))
      .send({ payload: v.body.payload, signature: v.body.signature, include_duplicates: false })
    expect(c.status).toBe(201)
    expect(c.body.batch.imported_rows).toBe(1)
    expect(c.body.batch.invalid_rows).toBe(1)

    const errors = await request(app)
      .get(`/api/imports/${c.body.batch.id}/errors`).set(authHeader(admin))
    expect(errors.status).toBe(200)
    expect(errors.body.rows.length).toBeGreaterThanOrEqual(1)
  })

  it('user (non-admin) cannot import (403)', async () => {
    const { app, store } = newApp()
    const { priya } = await demoUsers(store)
    const v = await request(app)
      .post('/api/imports/validate').set(authHeader(priya))
      .attach('file', csvBuffer(['X, Y,+91 99000 56565']), 'x.csv')
    expect(v.status).toBe(403)
  })

  it('serves an xlsx template with the exact 10 headers', async () => {
    const { app, store } = newApp()
    const { admin } = await demoUsers(store)
    const res = await request(app).get('/api/imports/template').set(authHeader(admin))
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('leadflow-template.xlsx')
    expect(TEMPLATE_HEADERS).toHaveLength(10)
  })

  it('templates build without throwing', () => {
    expect(() => buildXlsxTemplate()).not.toThrow()
    expect(buildCsvTemplate()).toContain(TEMPLATE_HEADERS[0])
  })
})
