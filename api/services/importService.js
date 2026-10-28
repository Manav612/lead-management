import XLSX from 'xlsx'
import { ApiError } from '../lib/utils.js'
import { hmacSign, safeEqualHex, sha256hex } from '../lib/localToken.js'

export const TEMPLATE_HEADERS = [
  'Lead Name', 'Company Name', 'Phone Number', 'Email', 'City',
  'Lead Source', 'Interested Product/Service', 'Estimated Deal Value', 'Priority', 'Remarks'
]

const EXAMPLE_ROW = [
  'Rahul Sharma', 'Sharma Traders', '+91 98200 11111', 'rahul@sharmatraders.in',
  'Mumbai', 'Website', 'Annual plan', 150000, 'high', 'Interested after webinar'
]

const normHeader = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ')
const HEADER_MAP = Object.fromEntries(
  TEMPLATE_HEADERS.map((h) => [normHeader(h), h])
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PRIORITY_MAP = {
  high: 'high', 'urgent': 'high', 'hot': 'high', '1': 'high',
  medium: 'medium', 'med': 'medium', 'normal': 'medium', 'regular': 'medium', '2': 'medium',
  low: 'low', 'cold': 'low', '3': 'low'
}

// ---------- value normalisation & validation ----------
export function normalizePhone(v) {
  return String(v ?? '').replace(/[()\s\-\.]/g, '').trim()
}
export function normalizeEmail(v) {
  return String(v ?? '').trim().toLowerCase()
}
export function parseDealValue(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const cleaned = String(v).replace(/[₹,$\s,]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}
export function normalizePriority(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 'medium'
  return PRIORITY_MAP[normHeader(v)] || null
}

export function validateImportRow(rawRow) {
  // raw rows are keyed by template headers; map to internal field names
  const row = {
    name: rawRow['Lead Name'],
    phone: rawRow['Phone Number'],
    email: rawRow['Email'],
    company_name: rawRow['Company Name'],
    city: rawRow['City'],
    lead_source: rawRow['Lead Source'],
    interested_product_or_service: rawRow['Interested Product/Service'],
    estimated_deal_value: rawRow['Estimated Deal Value'],
    priority: rawRow['Priority'],
    remarks: rawRow['Remarks']
  }
  const errors = []
  const data = {}

  const name = String(row.name ?? '').trim()
  if (!name) errors.push('Lead Name is required')
  data.name = name

  const phone = normalizePhone(row.phone)
  const digits = phone.replace(/^\+/, '')
  if (!phone) errors.push('Phone Number is required')
  else if (!/^\+?\d{10,15}$/.test(phone)) errors.push(`Invalid phone number "${row.phone}"`)
  data.phone = phone

  const email = normalizeEmail(row.email)
  if (email && !EMAIL_RE.test(email)) errors.push(`Invalid email "${row.email}"`)
  data.email = email || null

  data.company_name = String(row.company_name ?? '').trim() || null
  data.city = String(row.city ?? '').trim() || null
  data.lead_source = String(row.lead_source ?? '').trim() || null
  data.interested_product_or_service = String(row.interested_product_or_service ?? '').trim() || null
  data.general_remarks = String(row.remarks ?? '').trim() || null

  const value = parseDealValue(row.estimated_deal_value)
  if (value !== null && (Number.isNaN(value) || value < 0)) {
    errors.push(`Estimated Deal Value must be a non-negative number (got "${row.estimated_deal_value}")`)
    data.estimated_deal_value = null
  } else {
    data.estimated_deal_value = value
  }

  const priority = normalizePriority(row.priority)
  if (!priority) errors.push(`Invalid Priority "${row.priority}" (use high, medium or low)`)
  data.priority = priority || 'medium'

  return { data, errors }
}

// ---------- workbook parsing ----------
export function parseWorkbook(buffer, filename, { maxRows } = {}) {
  const ext = (filename || '').toLowerCase().split('.').pop()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    throw new ApiError(400, `Unsupported file type ".${ext}". Upload an .xlsx, .xls or .csv file.`)
  }
  let wb
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false })
  } catch {
    throw new ApiError(400, 'Could not parse the file. Is it a valid Excel or CSV file?')
  }
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new ApiError(400, 'The file contains no data sheet')
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })

  const rows = []
  let headerIndex = -1
  for (let i = 0; i < grid.length; i++) {
    const cells = (grid[i] || []).map((c) => normHeader(c))
    const matched = cells.filter((c) => HEADER_MAP[c]).length
    if (matched >= 5) { headerIndex = i; break }
  }
  if (headerIndex === -1) {
    throw new ApiError(400, 'Header row not found. Download the template and keep the exact column headers on the first row.')
  }
  const headerCells = (grid[headerIndex] || []).map((c) => normHeader(c))
  const missing = TEMPLATE_HEADERS.filter((h) => !headerCells.includes(normHeader(h)))
  const renamed = headerCells.filter((c) => c && !HEADER_MAP[c] && !missing.length)

  const colIndex = {}
  for (const h of TEMPLATE_HEADERS) {
    colIndex[h] = headerCells.indexOf(normHeader(h))
  }

  for (let i = headerIndex + 1; i < grid.length; i++) {
    if (rows.length >= maxRows) {
      throw new ApiError(400, `File has more than ${maxRows} data rows. Split it into smaller files.`)
    }
    const cells = grid[i] || []
    if (cells.every((c) => String(c ?? '').trim() === '')) continue
    const raw = {}
    TEMPLATE_HEADERS.forEach((h, idx) => {
      const v = colIndex[h] >= 0 ? cells[colIndex[h]] : ''
      raw[h] = String(v ?? '').trim()
    })
    rows.push({ row_number: i + 1, raw })
  }
  return { missing, renamed, rows }
}

// ---------- duplicate detection ----------
export function detectDuplicates(rows, existingLeads) {
  const existingByPhone = new Map()
  const existingByEmail = new Map()
  for (const l of existingLeads) {
    const p = normalizePhone(l.phone)
    if (p) existingByPhone.set(p, l)
    if (l.email) existingByEmail.set(l.email.toLowerCase(), l)
  }
  const seenPhone = new Map()
  const seenEmail = new Map()

  for (const r of rows) {
    const { data } = r
    const matches = []
    const p = data.phone ? data.phone.replace(/^\+/, '') : null
    const e = data.email
    const inDb = (p && existingByPhone.get(p)) || (e && existingByEmail.get(e))
    if (inDb) matches.push({ kind: 'existing', lead: inDb })
    const inFileP = p && seenPhone.get(p)
    const inFileE = e && seenEmail.get(e)
    if (inFileP) matches.push({ kind: 'in_file', row_number: inFileP })
    if (inFileE) matches.push({ kind: 'in_file', row_number: inFileE })

    r.duplicate = matches.length > 0
    r.duplicate_reasons = matches.map((m) =>
      m.kind === 'existing'
        ? `Already exists in CRM (lead ${m.lead.lead_code}: ${m.lead.name})`
        : `Duplicate of row ${m.row_number} in this file`)
    if (p) seenPhone.set(p, r.row_number)
    if (e) seenEmail.set(e, r.row_number)
  }
  return rows
}

// ---------- signing (tamper-proof preview → confirm round trip) ----------
export function signPayload(payload, secret) {
  return hmacSign(payload, secret)
}
export function verifyPayload(payload, signature, secret) {
  return safeEqualHex(hmacSign(payload, secret), signature)
}
export const payloadHash = (payload) => sha256hex(payload)

// ---------- templates ----------
export function buildXlsxTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, EXAMPLE_ROW])
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function buildCsvTemplate() {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [TEMPLATE_HEADERS, EXAMPLE_ROW].map((r) => r.map(esc).join(',')).join('\n') + '\n'
}

// ---------- orchestration ----------
export function buildImportService(store, config) {
  async function validateUpload(buffer, filename, user) {
    const { missing, renamed, rows } = parseWorkbook(buffer, filename, { maxRows: config.maxImportRows })
    if (missing.length) {
      throw new ApiError(400, `Missing required column(s): ${missing.join(', ')}. Use the downloadable template.`, { missing })
    }

    const existing = await store.leads.exportLeads({})

    const results = []
    for (const r of rows) {
      const { data, errors } = validateImportRow(r.raw)
      results.push({
        row_number: r.row_number,
        data,
        raw_row_data: r.raw,
        status: errors.length ? 'invalid' : 'valid',
        errors,
        name: data.name,
        phone: data.phone,
        email: data.email
      })
    }

    detectDuplicates(results, existing)
    for (const r of results) {
      if (r.duplicate && r.status === 'valid') r.status = 'duplicate'
    }
    const invalid = results.filter((r) => r.status === 'invalid').length
    const duplicates = results.filter((r) => r.status === 'duplicate').length

    const payload = JSON.stringify({
      v: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
      filename,
      rows: results.map((r) => ({
        row_number: r.row_number,
        data: r.data,
        raw_row_data: r.raw_row_data,
        base_status: r.status
      }))
    })
    const signature = signPayload(payload, config.appSecret)

    return {
      summary: {
        total_rows: results.length,
        valid_rows: results.filter((r) => r.status === 'valid').length,
        invalid_rows: invalid,
        duplicate_rows: duplicates
      },
      rows: results.map(({ row_number, name, phone, email, status, errors, duplicate_reasons }) => ({
        row_number, name, phone, email, status,
        errors: [...errors, ...(duplicate_reasons || [])]
      })),
      payload,
      signature,
      expires_in_seconds: 3600
    }
  }

  async function confirmImport({ payload, signature, include_duplicates }, user) {
    if (!verifyPayload(payload, signature, config.appSecret)) {
      throw new ApiError(400, 'Import payload failed verification. Start the import again.')
    }
    let parsed
    try { parsed = JSON.parse(payload) } catch {
      throw new ApiError(400, 'Invalid import payload')
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      throw new ApiError(400, 'Import preview expired. Upload the file again.')
    }

    const sigHash = payloadHash(payload)
    const existingBatch = await store.imports.findBatchBySignature(sigHash)
    if (existingBatch) {
      const err = new ApiError(409, 'This file has already been imported.')
      err.batch = existingBatch
      throw err
    }

    // re-validate (defense in depth: the payload could have been replayed against a changed DB)
    const existing = await store.leads.exportLeads({})
    const results = parsed.rows.map((r) => {
      const { data, errors } = validateImportRow(r.raw_row_data)
      return { row_number: r.row_number, data, raw_row_data: r.raw_row_data, errors, status: errors.length ? 'invalid' : 'valid' }
    })
    detectDuplicates(results, existing)
    for (const r of results) if (r.duplicate && r.status === 'valid') r.status = 'duplicate'

    const invalidRows = results.filter((r) => r.status === 'invalid')
    const dupRows = results.filter((r) => r.status === 'duplicate')
    const importable = results.filter((r) =>
      r.status === 'valid' || (r.status === 'duplicate' && include_duplicates))

    const batch = await store.imports.importLeads({
      original_filename: parsed.filename,
      uploaded_by: user.id,
      total_rows: results.length,
      valid_rows: results.filter((r) => r.status === 'valid').length,
      invalid_rows: invalidRows.length,
      duplicate_rows: dupRows.length,
      skipped_duplicates: include_duplicates ? 0 : dupRows.length,
      signature_hash: sigHash,
      rows: importable.map((r) => r.data),
      error_rows: [...invalidRows, ...(!include_duplicates ? dupRows : [])].map((r) => ({
        row_number: r.row_number,
        raw_row_data: r.raw_row_data,
        error_messages: r.errors.length ? r.errors : ['Skipped: potential duplicate']
      }))
    })
    return batch
  }

  return { validateUpload, confirmImport }
}
