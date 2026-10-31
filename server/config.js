import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Always load the repo-root .env, no matter which directory the API is
// started from (`npm --prefix server run dev` runs with cwd = server/).
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const bool = (v, d = false) => (v === undefined ? d : String(v).toLowerCase() === 'true')

// NOTE: the export name must not be `config`. Vercel's function builder runs
// @vercel/static-config on every entrypoint; a file exporting
// `export const config = {...}` with a non-literal value (e.g. `process.env.X || 'y'`)
// fails the build with `Unhandled type: "LogicalExpression"`.
export const appConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  appSecret: process.env.APP_SECRET || 'leadflow-local-dev-secret-change-me',
  displayTimezone: process.env.DISPLAY_TIMEZONE || 'Asia/Kolkata',
  // import limits
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(5 * 1024 * 1024), 10),
  maxImportRows: parseInt(process.env.MAX_IMPORT_ROWS || '2000', 10)
}

export const isSupabaseConfigured = () =>
  Boolean(appConfig.supabaseUrl && appConfig.supabaseServiceRoleKey)

export const mode = isSupabaseConfigured() ? 'supabase' : 'local-dev'
