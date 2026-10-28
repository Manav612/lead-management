import { asyncHandler, ApiError } from '../lib/utils.js'

export function buildNotificationsController(ctx) {
  const { store } = ctx

  const list = asyncHandler(async (req, res) => {
    await store.notifications.ensureDue(req.user.id)
    const unreadOnly = req.query.unreadOnly === 'true'
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '20', 10)))
    const result = await store.notifications.list(req.user.id, { unreadOnly, page, pageSize })
    res.json(result)
  })

  const unreadCount = asyncHandler(async (req, res) => {
    await store.notifications.ensureDue(req.user.id)
    const count = await store.notifications.unreadCount(req.user.id)
    res.json({ count })
  })

  const markRead = asyncHandler(async (req, res) => {
    const ok = await store.notifications.markRead(req.user.id, req.params.id)
    if (!ok) throw new ApiError(404, 'Notification not found')
    res.json({ ok: true })
  })

  return { list, unreadCount, markRead }
}
