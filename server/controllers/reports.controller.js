import { asyncHandler } from '../lib/utils.js'

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildReportsController(ctx) {
  const { store } = ctx
  const scope = (req) => (req.user.role === 'admin' ? null : req.user.id)

  const summary = asyncHandler(async (req, res) => {
    const data = await store.reports.summary({
      from: req.query.dateFrom || undefined,
      to: req.query.dateTo || undefined,
      scopeUserId: scope(req)
    })
    res.json(data)
  })

  const byStatus = asyncHandler(async (req, res) => {
    res.json({ rows: await store.reports.leadsByStatus(scope(req)) })
  })

  const bySource = asyncHandler(async (req, res) => {
    res.json({ rows: await store.reports.leadsBySource(scope(req)) })
  })

  const overTime = asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days || '90', 10)))
    res.json({ rows: await store.reports.leadsOverTime(days, scope(req)) })
  })

  const performance = asyncHandler(async (req, res) => {
    res.json({ rows: await store.reports.performance() })
  })

  const lostReasons = asyncHandler(async (req, res) => {
    res.json({ rows: await store.reports.lostReasons(scope(req)) })
  })

  const exportCsv = asyncHandler(async (req, res) => {
    const type = req.query.type || 'status'
    if (type === 'performance') {
      const rows = await store.reports.performance()
      const header = ['Employee', 'Assigned', 'Won', 'Lost', 'Conversion Rate %', 'Pipeline Value', 'Overdue Follow-ups']
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="employee-performance.csv"')
      return res.send([header, ...rows.map((r) => [r.name, r.assigned, r.won, r.lost, r.conversion_rate, r.pipeline_value, r.overdue_follow_ups])].map((r) => r.map(csvEscape).join(',')).join('\n'))
    }
    if (type === 'source') {
      const rows = await store.reports.leadsBySource(scope(req))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="leads-by-source.csv"')
      return res.send([['Source', 'Count', 'Value'], ...rows.map((r) => [r.source, r.count, r.value])].map((r) => r.map(csvEscape).join(',')).join('\n'))
    }
    const rows = await store.reports.leadsByStatus(scope(req))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="leads-by-status.csv"')
    res.send([['Status', 'Count', 'Value'], ...rows.map((r) => [r.status, r.count, r.value])].map((r) => r.map(csvEscape).join(',')).join('\n'))
  })

  return { summary, byStatus, bySource, overTime, performance, lostReasons, exportCsv }
}
