import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import helmet from 'helmet'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { appConfig as config, mode, isSupabaseConfigured } from './config.js'
import { getStore } from './stores/index.js'
import { registerRoutes } from './routes/index.js'
import { buildLeadService } from './services/leadService.js'
import { buildFollowUpService } from './services/followUpService.js'
import { buildImportService } from './services/importService.js'
import { sendError, notFound } from './lib/utils.js'

/**
 * Builds the Express app (no listening) so the same app runs under
 * `node index.js` locally and as a Vercel Function in production.
 */
export function createApp() {
  const app = express()
  const store = getStore()
  const supabase = isSupabaseConfigured()
    ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null

  const ctx = {
    store,
    supabase,
    mode,
    config,
    leadService: buildLeadService(store),
    followUpService: buildFollowUpService(store),
    importService: buildImportService(store, config)
  }

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '2mb' }))

  registerRoutes(app, ctx)

  // Serve the built frontend from this same server when it is bundled with
  // the server (standalone hosts like Render). No-op on Vercel, where the
  // static files live outside the function and this directory does not exist.
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist')
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir))
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        return res.sendFile(path.join(distDir, 'index.html'))
      }
      next()
    })
  }

  app.use(notFound)
  app.use((err, req, res, next) => sendError(err, res)) // eslint-disable-line no-unused-vars
  return { app, ctx }
}
