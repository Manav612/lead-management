import crypto from 'node:crypto'
import { hashPassword } from '../lib/localToken.js'

const uuid = () => crypto.randomUUID()
const now = () => new Date()

/**
 * In-memory store used ONLY when Supabase is not configured (local demo mode).
 * It implements the exact same interface as supabaseStore.js so the rest of
 * the API cannot tell the difference. Data resets on server restart and the
 * UI shows a "Local demo mode" banner.
 */
export function createLocalStore() {
  const state = {
    profiles: [],
    leads: [],
    activities: [],
    statusHistory: [],
    followUps: [],
    notifications: [],
    importBatches: [],
    importErrors: [],
    settings: { lead_sources: ['Website', 'Referral', 'Cold Call', 'Social Media', 'Advertisement', 'Event'] },
    resetCodes: {}, // email -> { code, exp }
    codeSeq: 0
  }

  const byId = (arr, id) => arr.find((x) => x.id === id)

  // ---------------- profiles ----------------
  const profiles = {
    async listProfiles({ search } = {}) {
      let rows = [...state.profiles]
      if (search) {
        const q = search.toLowerCase()
        rows = rows.filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      }
      return rows.map((p) => ({
        ...p,
        lead_count: state.leads.filter((l) => l.assigned_to === p.id).length,
        won_count: state.leads.filter((l) => l.assigned_to === p.id && l.status === 'won').length,
        lost_count: state.leads.filter((l) => l.assigned_to === p.id && l.status === 'lost').length
      }))
    },
    async getProfile(id) { return byId(state.profiles, id) || null },
    async getProfileByEmail(email) {
      return state.profiles.find((p) => p.email.toLowerCase() === String(email).toLowerCase()) || null
    },
    async createProfile({ id, full_name, email, role, is_active = true, password }) {
      const p = {
        id: id || uuid(), full_name, email, role: role || 'user', is_active,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      if (password) p.passwordHash = hashPassword(password)
      state.profiles.push(p)
      return { ...p, passwordHash: undefined }
    },
    async updateProfile(id, fields) {
      const p = byId(state.profiles, id)
      if (!p) return null
      const { password, ...rest } = fields
      Object.assign(p, rest, { updated_at: new Date().toISOString() })
      if (password) p.passwordHash = hashPassword(password)
      return { ...p, passwordHash: undefined }
    }
  }

  // ---------------- leads ----------------
  const profileName = (id) => (byId(state.profiles, id) || {}).full_name || null

  const withNames = (l) => ({
    ...l,
    assigned_to_name: l.assigned_to ? profileName(l.assigned_to) : null,
    created_by_name: l.created_by ? profileName(l.created_by) : null
  })

  const applyLeadFilters = (rows, f = {}, { scopeUserId } = {}) => {
    let out = rows
    if (scopeUserId) out = out.filter((l) => l.assigned_to === scopeUserId)
    if (f.status) out = out.filter((l) => l.status === f.status)
    if (f.priority) out = out.filter((l) => l.priority === f.priority)
    if (f.source) out = out.filter((l) => (l.lead_source || 'Unspecified') === f.source)
    if (f.assignedTo) out = out.filter((l) => l.assigned_to === f.assignedTo)
    if (f.outcome === 'won' || f.outcome === 'lost') out = out.filter((l) => l.status === f.outcome)
    if (f.dateFrom) out = out.filter((l) => l.created_at >= `${f.dateFrom}T00:00:00.000Z`)
    if (f.dateTo) out = out.filter((l) => l.created_at <= `${f.dateTo}T23:59:59.999Z`)
    if (f.fuFrom) out = out.filter((l) => l.next_follow_up_at && l.next_follow_up_at >= `${f.fuFrom}T00:00:00.000Z`)
    if (f.fuTo) out = out.filter((l) => l.next_follow_up_at && l.next_follow_up_at <= `${f.fuTo}T23:59:59.999Z`)
    if (f.search) {
      const q = f.search.toLowerCase()
      out = out.filter((l) =>
        [l.name, l.company_name, l.phone, l.email, l.lead_code].some((v) => v && v.toLowerCase().includes(q)))
    }
    return out
  }

  const sortLeads = (rows, sort, dir) => {
    const key = ['created_at', 'name', 'status', 'priority', 'next_follow_up_at', 'estimated_deal_value'].includes(sort)
      ? sort : 'created_at'
    const m = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[key] ?? ''
      const bv = b[key] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * m
      return String(av).localeCompare(String(bv)) * m
    })
  }

  const leads = {
    async listLeads(f = {}, page = 1, pageSize = 20, sort = 'created_at', dir = 'desc', scopeUserId = null) {
      const filtered = sortLeads(applyLeadFilters(state.leads, f, { scopeUserId }), sort, dir)
      const total = filtered.length
      const start = (page - 1) * pageSize
      return { rows: filtered.slice(start, start + pageSize).map(withNames), total, page, pageSize }
    },
    async exportLeads(f = {}, scopeUserId = null) {
      return applyLeadFilters(state.leads, f, { scopeUserId }).map(withNames)
    },
    async getLead(id, scopeUserId = null) {
      const l = byId(state.leads, id)
      if (!l) return null
      if (scopeUserId && l.assigned_to !== scopeUserId) return null
      return withNames(l)
    },
    async createLead(data, userId) {
      state.codeSeq += 1
      const l = {
        id: uuid(),
        lead_code: `LD-${now().getFullYear()}-${String(state.codeSeq).padStart(6, '0')}`,
        name: data.name,
        company_name: data.company_name || null,
        phone: data.phone,
        email: data.email || null,
        city: data.city || null,
        lead_source: data.lead_source || null,
        interested_product_or_service: data.interested_product_or_service || null,
        estimated_deal_value: data.estimated_deal_value ?? null,
        priority: data.priority || 'medium',
        status: data.status || 'new',
        assigned_to: data.assigned_to || null,
        general_remarks: data.general_remarks || null,
        import_batch_id: null,
        created_by: userId,
        next_follow_up_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      state.leads.push(l)
      return withNames(l)
    },
    async updateLead(id, fields) {
      const l = byId(state.leads, id)
      if (!l) return null
      Object.assign(l, fields, { updated_at: new Date().toISOString() })
      return withNames(l)
    },
    async setAssigned(leadIds, assignedTo) {
      let n = 0
      for (const id of leadIds) {
        const l = byId(state.leads, id)
        if (l) { l.assigned_to = assignedTo; l.updated_at = new Date().toISOString(); n++ }
      }
      return n
    },
    async nextLeadCode() {
      state.codeSeq += 1
      return `LD-${now().getFullYear()}-${String(state.codeSeq).padStart(6, '0')}`
    },
    async findByPhoneOrEmail(phones, emails) {
      const pset = new Set(phones.filter(Boolean))
      const eset = new Set(emails.map((e) => e.toLowerCase()).filter(Boolean))
      return state.leads.filter((l) => pset.has(l.phone) || (l.email && eset.has(l.email.toLowerCase())))
    },
    async refreshNextFollowUp(leadId) {
      const pending = state.followUps.filter((f) => f.lead_id === leadId && f.status === 'pending')
      const l = byId(state.leads, leadId)
      if (l) {
        l.next_follow_up_at = pending.length
          ? pending.map((f) => f.due_at).sort()[0]
          : null
        l.updated_at = new Date().toISOString()
      }
    }
  }

  // ---------------- activities ----------------
  const activities = {
    async listByLead(leadId) {
      return state.activities
        .filter((a) => a.lead_id === leadId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((a) => ({ ...a, user_name: profileName(a.user_id) }))
    },
    async create(data) {
      const a = { id: uuid(), created_at: new Date().toISOString(), ...data }
      state.activities.push(a)
      return { ...a, user_name: profileName(a.user_id) }
    },
    async recent(limit = 5, scopeUserId = null) {
      let rows = [...state.activities].sort((a, b) => b.created_at.localeCompare(a.created_at))
      if (scopeUserId) {
        rows = rows.filter((a) => {
          const l = byId(state.leads, a.lead_id)
          return l && l.assigned_to === scopeUserId
        })
      }
      return rows.slice(0, limit).map((a) => ({
        ...a, user_name: profileName(a.user_id),
        lead_name: byId(state.leads, a.lead_id)?.name || null
      }))
    }
  }

  // ---------------- status history ----------------
  const statusHistory = {
    async listByLead(leadId) {
      return state.statusHistory
        .filter((h) => h.lead_id === leadId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((h) => ({ ...h, changed_by_name: profileName(h.changed_by) }))
    },
    async add(data) {
      const h = { id: uuid(), created_at: new Date().toISOString(), ...data }
      state.statusHistory.push(h)
      return { ...h, changed_by_name: profileName(h.changed_by) }
    }
  }

  // ---------------- follow ups ----------------
  const fuWithNames = (f) => ({
    ...f,
    lead_code: byId(state.leads, f.lead_id)?.lead_code || null,
    lead_name: byId(state.leads, f.lead_id)?.name || null,
    assigned_to_name: f.assigned_to ? profileName(f.assigned_to) : null,
    created_by_name: f.created_by ? profileName(f.created_by) : null
  })

  const istDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)

  const fuTabs = {
    today: (f) => f.status === 'pending' && istDate(new Date(f.due_at)) === istDate(new Date()),
    upcoming: (f) => f.status === 'pending' && new Date(f.due_at) > new Date() && istDate(new Date(f.due_at)) !== istDate(new Date()),
    overdue: (f) => f.status === 'pending' && new Date(f.due_at) < new Date(),
    completed: (f) => f.status === 'completed',
    cancelled: (f) => f.status === 'cancelled'
  }

  const followUps = {
    async list({ tab, status, leadId, assignedTo } = {}, page = 1, pageSize = 20, scopeUserId = null) {
      let rows = [...state.followUps]
      if (scopeUserId) rows = rows.filter((f) => f.assigned_to === scopeUserId)
      if (assignedTo) rows = rows.filter((f) => f.assigned_to === assignedTo)
      if (leadId) rows = rows.filter((f) => f.lead_id === leadId)
      if (tab && fuTabs[tab]) rows = rows.filter(fuTabs[tab])
      else if (status) rows = rows.filter((f) => f.status === status)
      rows.sort((a, b) => a.due_at.localeCompare(b.due_at))
      const total = rows.length
      const start = (page - 1) * pageSize
      return { rows: rows.slice(start, start + pageSize).map(fuWithNames), total, page, pageSize }
    },
    async get(id, scopeUserId = null) {
      const f = byId(state.followUps, id)
      if (!f) return null
      if (scopeUserId && f.assigned_to !== scopeUserId) return null
      return fuWithNames(f)
    },
    async create(data) {
      const f = { id: uuid(), status: 'pending', completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...data }
      state.followUps.push(f)
      return fuWithNames(f)
    },
    async update(id, fields) {
      const f = byId(state.followUps, id)
      if (!f) return null
      Object.assign(f, fields, { updated_at: new Date().toISOString() })
      return fuWithNames(f)
    },
    async complete(id, { outcome, completedAt }) {
      const f = byId(state.followUps, id)
      if (!f) return null
      f.status = 'completed'
      f.outcome = outcome || null
      f.completed_at = typeof completedAt === 'string'
        ? completedAt
        : (completedAt instanceof Date ? completedAt.toISOString() : new Date().toISOString())
      f.updated_at = new Date().toISOString()
      return fuWithNames(f)
    },
    async minPendingDueAt(leadId) {
      const pending = state.followUps.filter((f) => f.lead_id === leadId && f.status === 'pending')
      return pending.length ? pending.map((f) => f.due_at).sort()[0] : null
    },
    async pendingCounts(scopeUserId = null) {
      let rows = state.followUps.filter((f) => f.status === 'pending')
      if (scopeUserId) rows = rows.filter((f) => f.assigned_to === scopeUserId)
      return {
        due_today: rows.filter(fuTabs.today).length,
        overdue: rows.filter(fuTabs.overdue).length
      }
    }
  }

  // ---------------- notifications ----------------
  const notifications = {
    async list(userId, { unreadOnly = false, page = 1, pageSize = 20 } = {}) {
      let rows = state.notifications.filter((n) => n.user_id === userId && (!unreadOnly || !n.is_read))
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
      const total = rows.length
      const start = (page - 1) * pageSize
      return {
        rows: rows.slice(start, start + pageSize).map((n) => ({
          ...n,
          lead_code: n.lead_id ? byId(state.leads, n.lead_id)?.lead_code || null : null,
          lead_name: n.lead_id ? byId(state.leads, n.lead_id)?.name || null : null
        })),
        total, page, pageSize
      }
    },
    async unreadCount(userId) {
      return state.notifications.filter((n) => n.user_id === userId && !n.is_read).length
    },
    async markRead(userId, id) {
      const n = byId(state.notifications, id)
      if (n && n.user_id === userId) n.is_read = true
      return Boolean(n)
    },
    async create(data) {
      const n = { id: uuid(), is_read: false, created_at: new Date().toISOString(), ...data }
      state.notifications.push(n)
      return n
    },
    // Idempotent: at most one row per (follow_up, event type).
    async ensureDue(userId) {
      const today = istDate(new Date())
      for (const f of state.followUps) {
        if (f.assigned_to !== userId || f.status !== 'pending') continue
        const type = new Date(f.due_at) < new Date() && istDate(new Date(f.due_at)) !== today
          ? 'follow_up_overdue'
          : (istDate(new Date(f.due_at)) === today ? 'follow_up_due' : null)
        if (type && !state.notifications.some((n) => n.follow_up_id === f.id && n.notification_type === type)) {
          const lead = byId(state.leads, f.lead_id)
          await notifications.create({
            user_id: userId, lead_id: f.lead_id, follow_up_id: f.id,
            title: type === 'follow_up_overdue' ? 'Overdue follow-up' : 'Follow-up due today',
            message: `Follow-up "${f.title}" for ${lead?.name || 'lead'} ${type === 'follow_up_overdue' ? 'is overdue' : 'is due today'}.`,
            notification_type: type
          })
        }
        if (f.reminder_at && new Date(f.reminder_at) <= new Date() &&
            !state.notifications.some((n) => n.follow_up_id === f.id && n.notification_type === 'follow_up_reminder')) {
          const lead = byId(state.leads, f.lead_id)
          await notifications.create({
            user_id: userId, lead_id: f.lead_id, follow_up_id: f.id,
            title: 'Follow-up reminder',
            message: `Reminder: "${f.title}" for ${lead?.name || 'lead'} is now due.`,
            notification_type: 'follow_up_reminder'
          })
        }
      }
    }
  }

  // ---------------- import batches ----------------
  const imports = {
    async findBatchBySignature(sig) {
      return state.importBatches.find((b) => b.signature_hash === sig) || null
    },
    async importLeads({ original_filename, uploaded_by, total_rows, valid_rows, invalid_rows, duplicate_rows, skipped_duplicates, signature_hash, rows, error_rows }) {
      const existing = state.importBatches.find((b) => b.signature_hash === signature_hash)
      if (existing) return { ...existing }
      const batch = {
        id: uuid(),
        original_filename,
        uploaded_by,
        total_rows, valid_rows, invalid_rows, duplicate_rows,
        skipped_duplicates,
        imported_rows: 0,
        import_status: 'completed',
        signature_hash,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      }
      state.importBatches.push(batch)
      for (const r of rows) {
        await leads.createLead({ ...r, status: 'new' }, uploaded_by)
        const l = state.leads[state.leads.length - 1]
        l.import_batch_id = batch.id
        batch.imported_rows++
      }
      for (const e of error_rows || []) {
        state.importErrors.push({
          id: uuid(), import_batch_id: batch.id,
          row_number: e.row_number, raw_row_data: e.raw_row_data, error_messages: e.error_messages,
          created_at: new Date().toISOString()
        })
      }
      return { ...batch }
    },
    async listBatches(page = 1, pageSize = 20) {
      const rows = [...state.importBatches].sort((a, b) => b.created_at.localeCompare(a.created_at))
      const start = (page - 1) * pageSize
      return {
        rows: rows.slice(start, start + pageSize).map((b) => ({ ...b, uploaded_by_name: profileName(b.uploaded_by) })),
        total: rows.length, page, pageSize
      }
    },
    async getBatch(id) {
      const b = byId(state.importBatches, id)
      return b ? { ...b, uploaded_by_name: profileName(b.uploaded_by) } : null
    },
    async listErrors(batchId, page = 1, pageSize = 50) {
      const rows = state.importErrors.filter((e) => e.import_batch_id === batchId).sort((a, b) => a.row_number - b.row_number)
      const start = (page - 1) * pageSize
      return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize }
    }
  }

  // ---------------- settings ----------------
  const settings = {
    async getSettings() { return { ...state.settings } },
    async setSettings(fields) {
      Object.assign(state.settings, fields)
      return { ...state.settings }
    }
  }

  // ---------------- reports ----------------
  const scope = (scopeUserId) =>
    scopeUserId ? state.leads.filter((l) => l.assigned_to === scopeUserId) : [...state.leads]

  const inRange = (rows, from, to) => rows.filter((l) =>
    (!from || l.created_at >= `${from}T00:00:00.000Z`) && (!to || l.created_at <= `${to}T23:59:59.999Z`))

  const reports = {
    async summary({ from, to, scopeUserId } = {}) {
      const rows = inRange(scope(scopeUserId), from, to)
      const c = (s) => rows.filter((l) => l.status === s).length
      const decided = c('won') + c('lost')
      const fc = await followUps.pendingCounts(scopeUserId)
      const emp = {}
      for (const l of rows) {
        const n = l.assigned_to ? profileName(l.assigned_to) : 'Unassigned'
        emp[n] = (emp[n] || 0) + 1
      }
      const byStatus = {}
      for (const l of rows) byStatus[l.status] = (byStatus[l.status] || 0) + 1
      const bySource = {}
      for (const l of rows) {
        const s = l.lead_source || 'Unspecified'
        bySource[s] = (bySource[s] || 0) + 1
      }
      return {
        total_leads: rows.length,
        new_leads: c('new'),
        active_leads: rows.filter((l) => !['won', 'lost', 'on_hold'].includes(l.status)).length,
        qualified_leads: c('qualified'),
        won_leads: c('won'),
        lost_leads: c('lost'),
        pipeline_value: rows.filter((l) => !['won', 'lost'].includes(l.status))
          .reduce((s, l) => s + Number(l.estimated_deal_value || 0), 0),
        conversion_rate: decided === 0 ? 0 : Math.round((100 * c('won')) / decided * 10) / 10,
        follow_ups_due_today: fc.due_today,
        overdue_follow_ups: fc.overdue,
        employee_distribution: Object.entries(emp).map(([name, lead_count]) => ({ name, lead_count }))
          .sort((a, b) => b.lead_count - a.lead_count).slice(0, 10),
        leads_by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count),
        leads_by_source: Object.entries(bySource).map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count),
        recent_activities: await activities.recent(5, scopeUserId),
        recent_imports: (await imports.listBatches(1, 3)).rows
      }
    },
    async leadsByStatus(scopeUserId = null) {
      const rows = scope(scopeUserId)
      const map = {}
      for (const l of rows) {
        map[l.status] = map[l.status] || { status: l.status, count: 0, value: 0 }
        map[l.status].count++
        map[l.status].value += Number(l.estimated_deal_value || 0)
      }
      return Object.values(map).sort((a, b) => b.count - a.count)
    },
    async leadsBySource(scopeUserId = null) {
      const rows = scope(scopeUserId)
      const map = {}
      for (const l of rows) {
        const s = l.lead_source || 'Unspecified'
        map[s] = map[s] || { source: s, count: 0, value: 0 }
        map[s].count++
        map[s].value += Number(l.estimated_deal_value || 0)
      }
      return Object.values(map).sort((a, b) => b.count - a.count)
    },
    async leadsOverTime(days = 90, scopeUserId = null) {
      const rows = scope(scopeUserId)
      const out = []
      const today = new Date()
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today); d.setUTCDate(d.getUTCDate() - i)
        const key = d.toISOString().slice(0, 10)
        out.push({ date: key, count: rows.filter((l) => l.created_at.slice(0, 10) === key).length })
      }
      return out
    },
    async performance() {
      const rows = state.profiles.filter((p) => p.is_active).map((p) => {
        const ls = state.leads.filter((l) => l.assigned_to === p.id)
        const won = ls.filter((l) => l.status === 'won').length
        const lost = ls.filter((l) => l.status === 'lost').length
        const decided = won + lost
        return {
          user_id: p.id,
          name: p.full_name,
          assigned: ls.length,
          won, lost,
          conversion_rate: decided === 0 ? 0 : Math.round((100 * won) / decided * 10) / 10,
          pipeline_value: ls.filter((l) => !['won', 'lost'].includes(l.status))
            .reduce((s, l) => s + Number(l.estimated_deal_value || 0), 0),
          overdue_follow_ups: state.followUps.filter((f) => f.assigned_to === p.id && f.status === 'pending' && new Date(f.due_at) < new Date()).length
        }
      })
      return rows.sort((a, b) => b.assigned - a.assigned)
    },
    async lostReasons(scopeUserId = null) {
      const rows = state.statusHistory.filter((h) => h.new_status === 'lost')
        .filter((h) => {
          const l = byId(state.leads, h.lead_id)
          return l && (!scopeUserId || l.assigned_to === scopeUserId)
        })
      const map = {}
      for (const h of rows) {
        const r = h.reason || '(no reason given)'
        map[r] = (map[r] || 0) + 1
      }
      return Object.entries(map).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
    }
  }

  return {
    state,
    profiles, leads, activities, statusHistory, followUps,
    notifications, imports, settings, reports,
    istDate, fuTabs
  }
}

// ---------------------------------------------------------------------------
// Deterministic sample data for local demo mode (clearly demo, resets on restart)
// ---------------------------------------------------------------------------
// Fully synchronous: local store methods mutate state synchronously before
// resolving, so the seeder calls them and reads the fresh row back from state.
export function seedLocalStore(store) {
  const { state } = store
  const daysAgo = (d, h = 10) => {
    const t = new Date(); t.setDate(t.getDate() - d); t.setUTCHours(h, 0, 0, 0); return t.toISOString()
  }
  const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString()

  const mkProfile = (email, full_name, role, password) => {
    store.profiles.createProfile({ email, full_name, role, password })
    return state.profiles.find((p) => p.email === email)
  }

  const admin = mkProfile('admin@leadflow.local', 'Asha Mehta', 'admin', 'Admin@123')
  const priya = mkProfile('priya@leadflow.local', 'Priya Nair', 'user', 'User@123')
  const arjun = mkProfile('arjun@leadflow.local', 'Arjun Singh', 'user', 'User@123')

  const L = [
    ['Rahul Sharma', 'Sharma Traders', '+919820011111', 'rahul@sharmatraders.in', 'Mumbai', 'Website', 'Annual plan', 150000, 'high', 'qualified', priya.id, 52],
    ['Anita Verma', 'Verma Textiles', '+919811122222', 'anita@vermatextiles.com', 'Indore', 'Referral', 'Team plan', 320000, 'medium', 'proposal_sent', arjun.id, 48],
    ['Kiran Patel', 'Patel Logistics', '+919909033333', null, 'Ahmedabad', 'Cold Call', 'Annual plan', 90000, 'low', 'new', priya.id, 41],
    ['Meera Iyer', 'Iyer Consulting', '+919845044444', 'meera@iyercons.com', 'Chennai', 'Social Media', 'Team plan', 210000, 'high', 'won', arjun.id, 39],
    ['Suresh Nair', 'Nair Motors', '+919740055555', 'suresh@nairmotors.in', 'Kochi', 'Advertisement', 'Starter plan', 45000, 'medium', 'lost', priya.id, 37],
    ['Vikram Joshi', 'Joshi & Co', '+919867066666', 'vikram@joshiandco.com', 'Pune', 'Website', 'Annual plan', 180000, 'high', 'contacted', arjun.id, 33],
    ['Divya Reddy', 'Reddy Softworks', '+919985077777', 'divya@reddysoft.in', 'Hyderabad', 'Event', 'Team plan', 260000, 'medium', 'follow_up', priya.id, 30],
    ['Rajesh Kumar', 'Kumar Hardware', '+919812388888', null, 'Jaipur', 'Cold Call', 'Starter plan', 30000, 'low', 'new', arjun.id, 28],
    ['Pooja Singh', 'Singh Enterprises', '+919833199999', 'pooja@singhent.in', 'Delhi', 'Referral', 'Annual plan', 175000, 'high', 'qualified', priya.id, 25],
    ['Amit Gupta', 'Gupta Electronics', '+919899101010', 'amit@guptaelec.com', 'Delhi', 'Website', 'Team plan', 240000, 'medium', 'contacted', arjun.id, 22],
    ['Sneha Kulkarni', 'Kulkarni Design', '+919822211111', 'sneha@kdesign.in', 'Pune', 'Social Media', 'Starter plan', 55000, 'low', 'new', priya.id, 20],
    ['Nikhil Bansal', 'Bansal Agro', '+919928422222', 'nikhil@bansalgo.com', 'Indore', 'Cold Call', 'Annual plan', 120000, 'medium', 'on_hold', arjun.id, 18],
    ['Lakshmi Rao', 'Rao Pharma', '+919448033333', 'lakshmi@raopharma.in', 'Chennai', 'Referral', 'Annual plan', 310000, 'high', 'proposal_sent', priya.id, 15],
    ['Harpreet Gill', 'Gill Motors', '+919815544444', null, 'Mumbai', 'Advertisement', 'Team plan', 200000, 'medium', 'contacted', arjun.id, 13],
    ['Farhan Ali', 'Ali Interiors', '+919987755555', 'farhan@aliinteriors.in', 'Hyderabad', 'Website', 'Starter plan', 60000, 'low', 'new', priya.id, 11],
    ['Kavita Desai', 'Desai FinServ', '+919820066666', 'kavita@desaifinserv.com', 'Mumbai', 'Event', 'Annual plan', 420000, 'high', 'won', arjun.id, 9],
    ['Ganesh Menon', 'Menon Agro Foods', '+919847077777', 'ganesh@menonagro.in', 'Kochi', 'Referral', 'Team plan', 150000, 'medium', 'follow_up', priya.id, 7],
    ['Ritu Malhotra', 'Malhotra Retail', '+919810088888', 'ritu@malhotraretail.com', 'Delhi', 'Social Media', 'Starter plan', 40000, 'low', 'lost', arjun.id, 6],
    ['Sameer Khan', 'Khan Builders', '+919900099999', null, 'Ahmedabad', 'Cold Call', 'Annual plan', 260000, 'high', 'qualified', priya.id, 4],
    ['Ishita Bose', 'Bose Analytics', '+919831100000', 'ishita@boseanalytics.in', 'Kolkata', 'Website', 'Team plan', 280000, 'medium', 'contacted', arjun.id, 2],
    ['Tarun Mehta', 'Mehta Polymers', '+919897111111', 'tarun@mehtapolymers.com', 'Mumbai', 'Referral', 'Annual plan', 190000, 'high', 'new', priya.id, 1],
    ['Neha Kapoor', 'Kapoor Studio', '+919810222222', 'neha@kapoorstudio.in', 'Pune', 'Social Media', 'Starter plan', 35000, 'low', 'on_hold', arjun.id, 0]
  ]

  const createdLeads = []
  for (const [name, company, phone, email, city, source, product, value, priority, status, assignee, ageDays] of L) {
    store.leads.createLead({
      name, company_name: company, phone, email, city,
      lead_source: source, interested_product_or_service: product,
      estimated_deal_value: value, priority, status,
      assigned_to: assignee, created_by: admin.id
    }, admin.id)
    createdLeads.push(state.leads[state.leads.length - 1])
  }
  // backdate created_at/updated_at
  createdLeads.forEach((l, i) => {
    l.created_at = daysAgo(L[i][11])
    l.updated_at = daysAgo(Math.max(0, L[i][11] - 2))
  })

  // two leads come from a seeded import batch
  const batch = {
    id: crypto.randomUUID(),
    original_filename: 'website-leads-october.csv',
    uploaded_by: admin.id,
    total_rows: 22, valid_rows: 20, invalid_rows: 1, duplicate_rows: 1, skipped_duplicates: 1,
    imported_rows: 22,
    import_status: 'completed',
    signature_hash: crypto.randomBytes(16).toString('hex'),
    created_at: daysAgo(1, 8), completed_at: daysAgo(1, 8)
  }
  state.importBatches.push(batch)
  createdLeads.forEach((l, i) => { if (i >= 19) l.import_batch_id = batch.id })
  state.importErrors.push({
    id: crypto.randomUUID(), import_batch_id: batch.id, row_number: 7,
    raw_row_data: { name: 'Bad Row', phone: '12345', email: '', city: '' },
    error_messages: ['Invalid phone number'],
    created_at: daysAgo(1, 8)
  })

  // status history for won/lost
  store.statusHistory.add({ lead_id: createdLeads[3].id, old_status: 'proposal_sent', new_status: 'won', changed_by: arjun.id, reason: 'Client accepted the annual plan' })
  store.statusHistory.add({ lead_id: createdLeads[4].id, old_status: 'follow_up', new_status: 'lost', changed_by: priya.id, reason: 'Budget not approved this quarter' })
  store.statusHistory.add({ lead_id: createdLeads[14].id, old_status: 'qualified', new_status: 'won', changed_by: arjun.id, reason: 'Upsell from existing customer' })
  store.statusHistory.add({ lead_id: createdLeads[17].id, old_status: 'contacted', new_status: 'lost', changed_by: arjun.id, reason: 'Chose a cheaper competitor' })

  // activities
  const A = [
    [createdLeads[0], priya.id, 'call', 'Intro call', 'Discussed requirements, wants a demo next week', 'interested', 50],
    [createdLeads[0], priya.id, 'email', 'Sent proposal', 'Proposal v1 shared via email', null, 12],
    [createdLeads[1], arjun.id, 'meeting', 'Requirements meeting', 'On-site discovery with the procurement team', 'positive', 44],
    [createdLeads[3], arjun.id, 'call', 'Final negotiation', 'Price agreed, contract sent', 'closed-won', 20],
    [createdLeads[3], arjun.id, 'note', 'Deal won', 'Signed the annual plan', null, 18],
    [createdLeads[4], priya.id, 'call', 'Follow-up call', 'Budget frozen for this quarter', 'lost', 30],
    [createdLeads[5], arjun.id, 'email', 'Intro email', 'Sent overview deck', null, 29],
    [createdLeads[6], priya.id, 'whatsapp', 'WhatsApp follow-up', 'Shared pricing sheet on WhatsApp', 'interested', 26],
    [createdLeads[8], priya.id, 'meeting', 'Demo', 'Full product demo, very engaged', 'positive', 21],
    [createdLeads[9], arjun.id, 'call', 'Intro call', 'Interested but comparing vendors', 'neutral', 18],
    [createdLeads[12], priya.id, 'call', 'Proposal discussion', 'Reviewed proposal details with CFO', 'positive', 11],
    [createdLeads[14], arjun.id, 'meeting', 'Kickoff', 'Implementation plan agreed', 'positive', 5],
    [createdLeads[18], priya.id, 'call', 'Qualification call', 'Good fit, strong budget', 'qualified', 2],
    [createdLeads[20], priya.id, 'email', 'Thank you email', 'Followed up after the webinar', null, 0]
  ]
  for (const [lead, uid, type, subject, remarks, outcome, age] of A) {
    store.activities.create({
      lead_id: lead.id, user_id: uid, activity_type: type, subject, remarks, outcome
    })
    state.activities[state.activities.length - 1].created_at = daysAgo(age)
  }

  // follow-ups
  const F = [
    [createdLeads[0], priya.id, 'Demo call with Rahul', 'Walk through the annual plan pricing', 'call', hoursFromNow(20), hoursFromNow(18), 'pending'],
    [createdLeads[1], arjun.id, 'Chase proposal', 'Follow up on the proposal sent two weeks ago', 'email', hoursFromNow(-26), null, 'pending'],
    [createdLeads[2], priya.id, 'First contact', 'Intro call about our services', 'call', hoursFromNow(70), hoursFromNow(60), 'pending'],
    [createdLeads[3], arjun.id, 'Onboarding kickoff', 'Kick off the implementation', 'meeting', hoursFromNow(-50), null, 'completed'],
    [createdLeads[5], arjun.id, 'Send case studies', 'Share two relevant customer stories', 'email', hoursFromNow(4), null, 'pending'],
    [createdLeads[6], priya.id, 'Pricing follow-up', 'Check if the pricing sheet was helpful', 'call', hoursFromNow(-10), null, 'pending'],
    [createdLeads[11], arjun.id, 'Revisit in January', 'Budget unfreezes in January', 'call', hoursFromNow(120), null, 'pending'],
    [createdLeads[12], priya.id, 'Contract review', 'Send contract to legal for review', 'meeting', hoursFromNow(96), hoursFromNow(90), 'pending'],
    [createdLeads[17], arjun.id, 'Final attempt', 'One last call before archiving', 'call', hoursFromNow(30), null, 'cancelled']
  ]
  for (const [lead, uid, title, desc, type, due, reminder, status] of F) {
    store.followUps.create({
      lead_id: lead.id, assigned_to: uid, created_by: uid,
      title, description: desc, follow_up_type: type,
      due_at: due, reminder_at: reminder,
      status, outcome: status === 'completed' ? 'Meeting held, plan agreed' : null,
      completed_at: status === 'completed' ? hoursFromNow(-48) : null
    })
    const f = state.followUps[state.followUps.length - 1]
    f.created_at = daysAgo(3)
    f.updated_at = daysAgo(1)
  }

  // notifications
  store.notifications.create({
    user_id: priya.id, lead_id: createdLeads[0].id,
    title: 'Lead assigned', message: 'Lead "Rahul Sharma - Sharma Traders" was assigned to you.',
    notification_type: 'assigned'
  })
  store.notifications.create({
    user_id: arjun.id, lead_id: createdLeads[1].id,
    title: 'Lead assigned', message: 'Lead "Anita Verma - Verma Textiles" was assigned to you.',
    notification_type: 'assigned'
  })

  // refresh denormalized next_follow_up_at
  for (const lead of state.leads) store.leads.refreshNextFollowUp(lead.id)
}
