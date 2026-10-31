import { asyncHandler } from '../lib/utils.js'
import {
  leadCreateSchema, leadUpdateSchema, bulkAssignSchema, activitySchema
} from '../lib/validators.js'

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildLeadsController(ctx) {
  const { store, leadService } = ctx

  const list = asyncHandler(async (req, res) => {
    const f = {
      search: req.query.search || undefined,
      status: req.query.status || undefined,
      priority: req.query.priority || undefined,
      source: req.query.source || undefined,
      assignedTo: req.query.assigned_to || undefined,
      dateFrom: req.query.dateFrom || undefined,
      dateTo: req.query.dateTo || undefined,
      fuFrom: req.query.fuFrom || undefined,
      fuTo: req.query.fuTo || undefined,
      outcome: req.query.outcome || undefined
    }
    if (f.assignedTo && req.user.role !== 'admin') delete f.assignedTo
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)))
    const sort = req.query.sort || 'created_at'
    const dir = req.query.dir === 'asc' ? 'asc' : 'desc'
    const scopeUserId = req.user.role === 'admin' ? null : req.user.id
    const result = await store.leads.listLeads(f, page, pageSize, sort, dir, scopeUserId)
    res.json(result)
  })

  const create = asyncHandler(async (req, res) => {
    const data = leadCreateSchema.parse(req.body)
    const lead = await leadService.createLead(data, req.user)
    res.status(201).json({ lead })
  })

  const get = asyncHandler(async (req, res) => {
    const lead = await store.leads.getLead(req.params.id)
    await leadService.assertLeadAccess(lead, req.user)
    res.json({ lead })
  })

  const update = asyncHandler(async (req, res) => {
    const data = leadUpdateSchema.parse(req.body)
    const lead = await leadService.updateLead(req.params.id, data, req.user)
    res.json({ lead })
  })

  const bulkAssign = asyncHandler(async (req, res) => {
    const { lead_ids, assigned_to } = bulkAssignSchema.parse(req.body)
    const updated = await leadService.bulkAssign(lead_ids, assigned_to, req.user)
    res.json({ updated })
  })

  const exportCsv = asyncHandler(async (req, res) => {
    const f = {
      search: req.query.search || undefined,
      status: req.query.status || undefined,
      priority: req.query.priority || undefined,
      source: req.query.source || undefined,
      assignedTo: req.query.assigned_to || undefined,
      dateFrom: req.query.dateFrom || undefined,
      dateTo: req.query.dateTo || undefined,
      fuFrom: req.query.fuFrom || undefined,
      fuTo: req.query.fuTo || undefined,
      outcome: req.query.outcome || undefined
    }
    if (f.assignedTo && req.user.role !== 'admin') delete f.assignedTo
    const rows = await store.leads.exportLeads(f, req.user.role === 'admin' ? null : req.user.id)
    const header = ['Lead Code', 'Name', 'Company Name', 'Phone', 'Email', 'City', 'Lead Source',
      'Interested Product/Service', 'Estimated Deal Value', 'Priority', 'Status', 'Assigned To',
      'Next Follow-up', 'Created At']
    const lines = [header.join(',')]
    for (const l of rows) {
      lines.push([
        l.lead_code, l.name, l.company_name, l.phone, l.email, l.city, l.lead_source,
        l.interested_product_or_service, l.estimated_deal_value ?? '', l.priority, l.status,
        l.assigned_to_name, l.next_follow_up_at, l.created_at
      ].map(csvEscape).join(','))
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="leadflow-leads-${Date.now()}.csv"`)
    res.send(lines.join('\n'))
  })

  const listActivities = asyncHandler(async (req, res) => {
    const lead = await store.leads.getLead(req.params.id)
    await leadService.assertLeadAccess(lead, req.user)
    const rows = await store.activities.listByLead(req.params.id)
    res.json({ rows })
  })

  const createActivity = asyncHandler(async (req, res) => {
    const data = activitySchema.parse(req.body)
    const activity = await leadService.addActivity(req.params.id, data, req.user)
    res.status(201).json({ activity })
  })

  const statusHistory = asyncHandler(async (req, res) => {
    const lead = await store.leads.getLead(req.params.id)
    await leadService.assertLeadAccess(lead, req.user)
    const rows = await store.statusHistory.listByLead(req.params.id)
    res.json({ rows })
  })

  return { list, create, get, update, bulkAssign, exportCsv, listActivities, createActivity, statusHistory }
}
