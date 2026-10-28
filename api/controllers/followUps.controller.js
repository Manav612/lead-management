import { asyncHandler, ApiError } from '../lib/utils.js'
import { followUpCreateSchema, followUpUpdateSchema, followUpCompleteSchema } from '../lib/validators.js'

export function buildFollowUpsController(ctx) {
  const { store, followUpService } = ctx

  const list = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)))
    const scopeUserId = req.user.role === 'admin' ? null : req.user.id
    const result = await store.followUps.list({
      tab: req.query.tab || undefined,
      status: req.query.status || undefined,
      leadId: req.query.lead_id || undefined,
      assignedTo: req.query.assigned_to && req.user.role === 'admin' ? req.query.assigned_to : undefined
    }, page, pageSize, scopeUserId)
    res.json(result)
  })

  const create = asyncHandler(async (req, res) => {
    const data = followUpCreateSchema.parse(req.body)
    const fu = await followUpService.create(data, req.user)
    res.status(201).json({ follow_up: fu })
  })

  const update = asyncHandler(async (req, res) => {
    const data = followUpUpdateSchema.parse(req.body)
    const fu = await followUpService.update(req.params.id, data, req.user)
    res.json({ follow_up: fu })
  })

  const complete = asyncHandler(async (req, res) => {
    const data = followUpCompleteSchema.parse(req.body)
    const fu = await followUpService.complete(req.params.id, data, req.user)
    res.json({ follow_up: fu })
  })

  const get = asyncHandler(async (req, res) => {
    const scopeUserId = req.user.role === 'admin' ? null : req.user.id
    const fu = await store.followUps.get(req.params.id, scopeUserId)
    if (!fu) throw new ApiError(404, 'Follow-up not found')
    res.json({ follow_up: fu })
  })

  const pendingCounts = asyncHandler(async (req, res) => {
    const scopeUserId = req.user.role === 'admin' ? null : req.user.id
    res.json({ counts: await store.followUps.pendingCounts(scopeUserId) })
  })

  return { list, create, update, complete, get, pendingCounts }
}
