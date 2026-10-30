import { createClient } from '@supabase/supabase-js'
import { STATUSES } from '../lib/validators.js'

/**
 * Supabase-backed store. Same interface as localStore.js.
 * Uses the service-role key (server only). RLS protects any direct
 * browser access; this store intentionally bypasses RLS for API work.
 */
export function createSupabaseStore(supabaseUrl, serviceRoleKey) {
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const pageRange = (page, pageSize) => [(page - 1) * pageSize, page * pageSize - 1]

  // Note: the named embeds (assigned_to / created_by) override the raw UUID
  // columns of the same name, so `id` must be selected in the embed for
  // ownership checks to work.
  const leadEmbed = '*, assigned_to:profiles!assigned_to(id, full_name), created_by:profiles!created_by(id, full_name)'
  const stripNames = (row) => {
    const out = { ...row }
    out.assigned_to_name = row.assigned_to?.full_name ?? null
    out.created_by_name = row.created_by?.full_name ?? null
    delete out.assigned_to
    delete out.created_by
    return out
  }

  const profiles = {
    async listProfiles({ search } = {}) {
      let q = sb.from('profiles').select('*')
      if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      const rows = data || []
      const leadCounts = {}
      for (const p of rows) {
        const { count: c } = await sb.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', p.id)
        const { count: w } = await sb.from('leads').select('*', { count: 'exact', head: true })
          .eq('assigned_to', p.id).eq('status', 'won')
        const { count: l } = await sb.from('leads').select('*', { count: 'exact', head: true })
          .eq('assigned_to', p.id).eq('status', 'lost')
        leadCounts[p.id] = { lead_count: c || 0, won_count: w || 0, lost_count: l || 0 }
      }
      return rows.map((p) => ({ ...p, ...leadCounts[p.id] }))
    },
    async getProfile(id) {
      const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
    async getProfileByEmail(email) {
      const { data, error } = await sb.from('profiles').select('*').ilike('email', email).maybeSingle()
      if (error) throw error
      return data
    },
    async createProfile({ id, full_name, email, role, is_active = true }) {
      // Upsert: the on_auth_user_created trigger may have already written the
      // profile row when the auth account was created.
      const { data, error } = await sb.from('profiles')
        .upsert({ id, full_name, email, role, is_active }, { onConflict: 'id' })
        .select().single()
      if (error) throw error
      return data
    },
    async updateProfile(id, fields) {
      const { data, error } = await sb.from('profiles').update(fields).eq('id', id).select().maybeSingle()
      if (error) throw error
      return data
    }
  }

  const buildLeadQuery = (f = {}, scopeUserId = null) => {
    let q = sb.from('leads').select(leadEmbed, { count: 'exact' })
    if (scopeUserId) q = q.eq('assigned_to', scopeUserId)
    if (f.status) q = q.eq('status', f.status)
    if (f.priority) q = q.eq('priority', f.priority)
    if (f.source) q = q.eq('lead_source', f.source)
    if (f.assignedTo) q = q.eq('assigned_to', f.assignedTo)
    if (f.outcome) q = q.eq('status', f.outcome)
    if (f.dateFrom) q = q.gte('created_at', `${f.dateFrom}T00:00:00.000Z`)
    if (f.dateTo) q = q.lte('created_at', `${f.dateTo}T23:59:59.999Z`)
    if (f.fuFrom) q = q.gte('next_follow_up_at', `${f.fuFrom}T00:00:00.000Z`)
    if (f.fuTo) q = q.lte('next_follow_up_at', `${f.fuTo}T23:59:59.999Z`)
    if (f.search) {
      const s = f.search.replace(/[%_,]/g, ' ')
      q = q.or(`name.ilike.%${s}%,company_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,lead_code.ilike.%${s}%`)
    }
    return q
  }

  const leads = {
    async listLeads(f = {}, page = 1, pageSize = 20, sort = 'created_at', dir = 'desc', scopeUserId = null) {
      const allowed = ['created_at', 'name', 'status', 'priority', 'next_follow_up_at', 'estimated_deal_value']
      const col = allowed.includes(sort) ? sort : 'created_at'
      const q = buildLeadQuery(f, scopeUserId)
        .order(col, { ascending: dir === 'asc' })
        .range(...pageRange(page, pageSize))
      const { data, error, count } = await q
      if (error) throw error
      return { rows: (data || []).map(stripNames), total: count || 0, page, pageSize }
    },
    async exportLeads(f = {}, scopeUserId = null) {
      const { data, error } = await buildLeadQuery(f, scopeUserId)
      if (error) throw error
      return (data || []).map(stripNames)
    },
    async getLead(id, scopeUserId = null) {
      let q = sb.from('leads').select(leadEmbed).eq('id', id).maybeSingle()
      const { data, error } = await q
      if (error) throw error
      if (!data) return null
      if (scopeUserId && data.assigned_to?.id !== scopeUserId) return null
      // stripNames gives assigned_to_name (display) but removes assigned_to;
      // the detail views + ownership checks need the UUID, so attach it back.
      const row = stripNames(data)
      row.assigned_to = data.assigned_to?.id ?? null
      return row
    },
    async createLead(data, userId) {
      const { data: codeRow, error: codeErr } = await sb.rpc('next_lead_code')
      if (codeErr) throw codeErr
      const lead_code = codeRow
      const { data: row, error } = await sb.from('leads')
        .insert({ ...data, lead_code, created_by: userId })
        .select(leadEmbed).single()
      if (error) throw error
      return stripNames(row)
    },
    async updateLead(id, fields) {
      const { data, error } = await sb.from('leads').update(fields).eq('id', id).select(leadEmbed).maybeSingle()
      if (error) throw error
      return data ? stripNames(data) : null
    },
    async setAssigned(leadIds, assignedTo) {
      const { error, count } = await sb.from('leads').update({ assigned_to: assignedTo })
        .in('id', leadIds)
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return count || 0
    },
    async nextLeadCode() {
      const { data, error } = await sb.rpc('next_lead_code')
      if (error) throw error
      return data
    },
    async findByPhoneOrEmail(phones, emails) {
      const orParts = []
      for (const p of new Set(phones.filter(Boolean))) orParts.push(`phone.eq.${p}`)
      for (const e of new Set(emails.map((x) => String(x).toLowerCase()).filter(Boolean))) orParts.push(`email.ilike.${e}`)
      if (!orParts.length) return []
      const { data, error } = await sb.from('leads').select('id, lead_code, name, phone, email').or(orParts.join(','))
      if (error) throw error
      return data || []
    },
    async refreshNextFollowUp(leadId) {
      const { data, error } = await sb.from('follow_ups')
        .select('due_at').eq('lead_id', leadId).eq('status', 'pending')
        .order('due_at', { ascending: true }).limit(1)
      if (error) throw error
      const next = data?.[0]?.due_at ?? null
      await sb.from('leads').update({ next_follow_up_at: next }).eq('id', leadId)
    }
  }

  const fuEmbed = '*, lead:leads(lead_code, name), assignee:profiles!follow_ups_assigned_to_fkey(full_name), creator:profiles!follow_ups_created_by_fkey(full_name)'

  const fuNames = (row) => ({
    ...row,
    lead_code: row.lead?.lead_code ?? null,
    lead_name: row.lead?.name ?? null,
    assigned_to: row.assigned_to,
    assigned_to_name: row.assignee?.full_name ?? null,
    created_by: row.created_by,
    created_by_name: row.creator?.full_name ?? null
  })
  const stripFu = (row) => {
    const out = fuNames(row)
    delete out.lead; delete out.assignee; delete out.creator
    return out
  }

  const followUps = {
    async list({ tab, status, leadId, assignedTo } = {}, page = 1, pageSize = 20, scopeUserId = null) {
      let q = sb.from('follow_ups').select(fuEmbed, { count: 'exact' })
      if (scopeUserId) q = q.eq('assigned_to', scopeUserId)
      if (assignedTo) q = q.eq('assigned_to', assignedTo)
      if (leadId) q = q.eq('lead_id', leadId)
      const nowIso = new Date().toISOString()
      // day boundaries in IST (Asia/Kolkata, fixed +05:30, no DST)
      const istDay = (ms) => new Date(ms + 19800000).toISOString().slice(0, 10)
      const istStartOfDay = (ms) => new Date(`${istDay(ms)}T00:00:00+05:30`).toISOString()
      if (tab === 'pending' || tab === 'today' || tab === 'upcoming' || tab === 'overdue') q = q.eq('status', 'pending')
      if (tab === 'today') q = q.gte('due_at', istStartOfDay(Date.now())).lt('due_at', istStartOfDay(Date.now() + 86400000))
      if (tab === 'upcoming') q = q.gt('due_at', nowIso)
      if (tab === 'overdue') q = q.lt('due_at', nowIso)
      if (tab === 'completed') q = q.eq('status', 'completed')
      if (tab === 'cancelled') q = q.eq('status', 'cancelled')
      if (!tab && status) q = q.eq('status', status)
      const { data, error, count } = await q.order('due_at', { ascending: true }).range(...pageRange(page, pageSize))
      if (error) throw error
      return { rows: (data || []).map(stripFu), total: count || 0, page, pageSize }
    },
    async get(id, scopeUserId = null) {
      const { data, error } = await sb.from('follow_ups').select(fuEmbed).eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      if (scopeUserId && data.assigned_to !== scopeUserId) return null
      return stripFu(data)
    },
    async create(data) {
      const { data: row, error } = await sb.from('follow_ups').insert(data).select(fuEmbed).single()
      if (error) throw error
      return stripFu(row)
    },
    async update(id, fields) {
      const { data, error } = await sb.from('follow_ups').update(fields).eq('id', id).select(fuEmbed).maybeSingle()
      if (error) throw error
      return data ? stripFu(data) : null
    },
    async complete(id, { outcome, completedAt }) {
      const { data, error } = await sb.from('follow_ups')
        .update({ status: 'completed', outcome, completed_at: completedAt || new Date().toISOString() })
        .eq('id', id).select(fuEmbed).maybeSingle()
      if (error) throw error
      return data ? stripFu(data) : null
    },
    async minPendingDueAt(leadId) {
      const { data, error } = await sb.from('follow_ups')
        .select('due_at').eq('lead_id', leadId).eq('status', 'pending')
        .order('due_at', { ascending: true }).limit(1)
      if (error) throw error
      return data?.[0]?.due_at ?? null
    },
    async pendingCounts(scopeUserId = null) {
      const base = () => {
        let q = sb.from('follow_ups').select('due_at', { count: 'exact', head: true }).eq('status', 'pending')
        if (scopeUserId) q = q.eq('assigned_to', scopeUserId)
        return q
      }
      const nowIso = new Date().toISOString()
      const todayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`
      const [due, over] = await Promise.all([
        base().gte('due_at', todayStart).lt('due_at', new Date(Date.now() + 86400000).toISOString().slice(0, 10)).then((r) => r.count || 0),
        base().lt('due_at', nowIso).then((r) => r.count || 0)
      ])
      return { due_today: due, overdue: over }
    }
  }

  const activities = {
    async listByLead(leadId) {
      const { data, error } = await sb.from('activities')
        .select('*, user:profiles!activities_user_id_fkey(full_name)')
        .eq('lead_id', leadId).order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map((a) => {
        const user_name = a.user?.full_name ?? null
        delete a.user
        return { ...a, user_name }
      })
    },
    async create(data) {
      const { data: row, error } = await sb.from('activities').insert(data)
        .select('*, user:profiles!activities_user_id_fkey(full_name)').single()
      if (error) throw error
      const user_name = row.user?.full_name ?? null
      delete row.user
      return { ...row, user_name }
    },
    async recent(limit = 5, scopeUserId = null) {
      let q = sb.from('activities')
        .select('*, user:profiles!activities_user_id_fkey(full_name), lead:leads(name)')
        .order('created_at', { ascending: false }).limit(limit)
      if (scopeUserId) q = q.filter('lead.assigned_to', 'eq', scopeUserId)
      const { data, error } = await q
      if (error) throw error
      return (data || []).map((a) => {
        const user_name = a.user?.full_name ?? null
        const lead_name = a.lead?.name ?? null
        delete a.user; delete a.lead
        return { ...a, user_name, lead_name }
      })
    }
  }

  const statusHistory = {
    async listByLead(leadId) {
      const { data, error } = await sb.from('lead_status_history')
        .select('*, changer:profiles!lead_status_history_changed_by_fkey(full_name)')
        .eq('lead_id', leadId).order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((h) => {
        const changed_by_name = h.changer?.full_name ?? null
        delete h.changer
        return { ...h, changed_by_name }
      })
    },
    async add(data) {
      const { data: row, error } = await sb.from('lead_status_history').insert(data).select().single()
      if (error) throw error
      return row
    }
  }

  const notifications = {
    async list(userId, { unreadOnly = false, page = 1, pageSize = 20 } = {}) {
      let q = sb.from('notifications').select('*, lead:leads(lead_code, name)', { count: 'exact' })
        .eq('user_id', userId)
      if (unreadOnly) q = q.eq('is_read', false)
      const { data, error, count } = await q.order('created_at', { ascending: false })
        .range(...pageRange(page, pageSize))
      if (error) throw error
      return {
        rows: (data || []).map((n) => {
          const lead_code = n.lead?.lead_code ?? null
          const lead_name = n.lead?.name ?? null
          delete n.lead
          return { ...n, lead_code, lead_name }
        }),
        total: count || 0, page, pageSize
      }
    },
    async unreadCount(userId) {
      const { count, error } = await sb.from('notifications')
        .select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false)
      if (error) throw error
      return count || 0
    },
    async markRead(userId, id) {
      const { data, error } = await sb.from('notifications')
        .update({ is_read: true }).eq('id', id).eq('user_id', userId).select('id')
      if (error) throw error
      return Boolean(data?.length)
    },
    async create(data) {
      const { data: row, error } = await sb.from('notifications').insert(data).select().single()
      if (error) throw error
      return row
    },
    async ensureDue(userId) {
      const { error } = await sb.rpc('ensure_due_notifications', { p_user_id: userId })
      if (error) throw error
    }
  }

  const imports = {
    async findBatchBySignature(sig) {
      const { data, error } = await sb.from('import_batches').select('*').eq('signature_hash', sig).maybeSingle()
      if (error) throw error
      return data
    },
    async importLeads(batchInfo) {
      const { data, error } = await sb.rpc('import_leads', {
        p_rows: batchInfo.rows,
        p_batch: {
          original_filename: batchInfo.original_filename,
          uploaded_by: batchInfo.uploaded_by,
          total_rows: batchInfo.total_rows,
          valid_rows: batchInfo.valid_rows,
          invalid_rows: batchInfo.invalid_rows,
          duplicate_rows: batchInfo.duplicate_rows,
          skipped_duplicates: batchInfo.skipped_duplicates,
          signature_hash: batchInfo.signature_hash,
          error_rows: batchInfo.error_rows
        }
      })
      if (error) throw error
      return data
    },
    async listBatches(page = 1, pageSize = 20) {
      const { data, error, count } = await sb.from('import_batches')
        .select('*, uploader:profiles!import_batches_uploaded_by_fkey(full_name)')
        .order('created_at', { ascending: false }).range(...pageRange(page, pageSize))
      if (error) throw error
      return {
        rows: (data || []).map((b) => {
          const uploaded_by_name = b.uploader?.full_name ?? null
          delete b.uploader
          return { ...b, uploaded_by_name }
        }),
        total: count || 0, page, pageSize
      }
    },
    async getBatch(id) {
      const { data, error } = await sb.from('import_batches')
        .select('*, uploader:profiles!import_batches_uploaded_by_fkey(full_name)')
        .eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      const uploaded_by_name = data.uploader?.full_name ?? null
      delete data.uploader
      return { ...data, uploaded_by_name }
    },
    async listErrors(batchId, page = 1, pageSize = 50) {
      const { data, error, count } = await sb.from('import_errors')
        .select('*').eq('import_batch_id', batchId).order('row_number', { ascending: true })
        .range(...pageRange(page, pageSize))
      if (error) throw error
      return { rows: data || [], total: count || 0, page, pageSize }
    }
  }

  const settings = {
    async getSettings() {
      const { data, error } = await sb.from('app_settings')
        .select('key, value').in('key', ['lead_sources'])
      if (error) throw error
      const out = {}
      for (const row of data || []) out[row.key] = row.value
      return out
    },
    async setSettings(fields) {
      for (const [key, value] of Object.entries(fields)) {
        const { error } = await sb.from('app_settings')
          .upsert({ key, value }, { onConflict: 'key' })
        if (error) throw error
      }
      return { ...fields }
    }
  }

  const scopeParam = (scopeUserId) => scopeUserId

  const reports = {
    async summary({ from, to, scopeUserId } = {}) {
      const { data, error } = await sb.rpc('report_summary', {
        p_from: from ? `${from}T00:00:00.000Z` : null,
        p_to: to ? `${to}T23:59:59.999Z` : null,
        p_user_id: scopeParam(scopeUserId) || null
      })
      if (error) throw error
      return data
    },
    async leadsByStatus(scopeUserId = null) {
      const { data, error } = await sb.rpc('report_leads_by_status', { p_user_id: scopeParam(scopeUserId) || null })
      if (error) throw error
      return data || []
    },
    async leadsBySource(scopeUserId = null) {
      const { data, error } = await sb.rpc('report_leads_by_source', { p_user_id: scopeParam(scopeUserId) || null })
      if (error) throw error
      return data || []
    },
    async leadsOverTime(days = 90, scopeUserId = null) {
      const { data, error } = await sb.rpc('report_leads_over_time', {
        p_days: days, p_user_id: scopeParam(scopeUserId) || null
      })
      if (error) throw error
      return data || []
    },
    async performance() {
      const { data, error } = await sb.rpc('report_performance')
      if (error) throw error
      return data || []
    },
    async lostReasons(scopeUserId = null) {
      const { data, error } = await sb.rpc('report_lost_reasons', { p_user_id: scopeParam(scopeUserId) || null })
      if (error) throw error
      return data || []
    }
  }

  return {
    client: sb,
    profiles, leads, activities, statusHistory, followUps,
    notifications, imports, settings, reports
  }
}
