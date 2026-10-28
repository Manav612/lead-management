import rateLimit from 'express-rate-limit'
import { asyncHandler as ah } from '../lib/utils.js'
import { buildAuthMiddleware, requireAdmin } from '../middleware/auth.js'
import { buildAuthController } from '../controllers/auth.controller.js'
import { buildLeadsController } from '../controllers/leads.controller.js'
import { buildFollowUpsController } from '../controllers/followUps.controller.js'
import { buildUsersController } from '../controllers/users.controller.js'
import { buildNotificationsController } from '../controllers/notifications.controller.js'
import { buildImportsController } from '../controllers/imports.controller.js'
import { buildReportsController } from '../controllers/reports.controller.js'
import { buildSettingsController } from '../controllers/settings.controller.js'

export function registerRoutes(app, ctx) {
  const requireAuth = buildAuthMiddleware(ctx)
  const auth = buildAuthController(ctx)
  const leads = buildLeadsController(ctx)
  const followUps = buildFollowUpsController(ctx)
  const users = buildUsersController(ctx)
  const notifications = buildNotificationsController(ctx)
  const imports = buildImportsController(ctx)
  const reports = buildReportsController(ctx)
  const settings = buildSettingsController(ctx)

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
  const importLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })

  // health (public)
  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', mode: ctx.mode, time: new Date().toISOString() }))

  // auth
  app.post('/api/auth/login', authLimiter, ah(auth.login))
  app.post('/api/auth/forgot-password', authLimiter, ah(auth.forgotPassword))
  app.post('/api/auth/reset-password', authLimiter, ah(auth.resetPassword))
  app.get('/api/me', requireAuth, ah(auth.me))

  // leads (export + bulk-assign must be declared before /:id)
  app.get('/api/leads', requireAuth, ah(leads.list))
  app.post('/api/leads', requireAuth, ah(leads.create))
  app.get('/api/leads/export', requireAuth, ah(leads.exportCsv))
  app.post('/api/leads/bulk-assign', requireAuth, requireAdmin, ah(leads.bulkAssign))
  app.get('/api/leads/:id', requireAuth, ah(leads.get))
  app.patch('/api/leads/:id', requireAuth, ah(leads.update))
  app.get('/api/leads/:id/activities', requireAuth, ah(leads.listActivities))
  app.post('/api/leads/:id/activities', requireAuth, ah(leads.createActivity))
  app.get('/api/leads/:id/status-history', requireAuth, ah(leads.statusHistory))

  // imports (admin only)
  app.get('/api/imports/template', requireAuth, requireAdmin, ah(imports.template))
  app.post('/api/imports/validate', requireAuth, requireAdmin, importLimiter, imports.validate, ah(imports.validateFile))
  app.post('/api/imports/confirm', requireAuth, requireAdmin, importLimiter, ah(imports.confirm))
  app.get('/api/imports', requireAuth, requireAdmin, ah(imports.list))
  app.get('/api/imports/:id', requireAuth, requireAdmin, ah(imports.get))
  app.get('/api/imports/:id/errors', requireAuth, requireAdmin, ah(imports.errors))
  app.get('/api/imports/:id/error-report', requireAuth, requireAdmin, ah(imports.errorReport))

  // follow-ups (pending-counts must be declared before /:id)
  app.get('/api/follow-ups', requireAuth, ah(followUps.list))
  app.get('/api/follow-ups/pending-counts', requireAuth, ah(followUps.pendingCounts))
  app.post('/api/follow-ups', requireAuth, ah(followUps.create))
  app.get('/api/follow-ups/:id', requireAuth, ah(followUps.get))
  app.patch('/api/follow-ups/:id', requireAuth, ah(followUps.update))
  app.post('/api/follow-ups/:id/complete', requireAuth, ah(followUps.complete))

  // users (admin only)
  app.get('/api/users', requireAuth, requireAdmin, ah(users.list))
  app.post('/api/users', requireAuth, requireAdmin, ah(users.create))
  app.patch('/api/users/:id', requireAuth, requireAdmin, ah(users.update))

  // notifications
  app.get('/api/notifications', requireAuth, ah(notifications.list))
  app.get('/api/notifications/unread-count', requireAuth, ah(notifications.unreadCount))
  app.patch('/api/notifications/:id/read', requireAuth, ah(notifications.markRead))

  // reports
  app.get('/api/reports/summary', requireAuth, ah(reports.summary))
  app.get('/api/reports/leads-by-status', requireAuth, ah(reports.byStatus))
  app.get('/api/reports/leads-by-source', requireAuth, ah(reports.bySource))
  app.get('/api/reports/leads-over-time', requireAuth, ah(reports.overTime))
  app.get('/api/reports/performance', requireAuth, requireAdmin, ah(reports.performance))
  app.get('/api/reports/lost-reasons', requireAuth, ah(reports.lostReasons))
  app.get('/api/reports/export', requireAuth, ah(reports.exportCsv))

  // settings (admin only)
  app.get('/api/settings', requireAuth, requireAdmin, ah(settings.get))
  app.post('/api/settings', requireAuth, requireAdmin, ah(settings.set))
}
