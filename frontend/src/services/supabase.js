import { createClient } from '@supabase/supabase-js'
import { HAS_SUPABASE } from '../config'

// Browser-side Supabase client (auth only — all data goes through our API).
export const supabase = HAS_SUPABASE
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : null

export function friendlyAuthError(error) {
  const msg = String(error?.message || error || '')
  if (/invalid login credentials/i.test(msg)) return 'Invalid email or password. Please try again.'
  if (/email not confirmed/i.test(msg)) return 'Your email is not confirmed yet. Check your inbox for the confirmation link.'
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.'
  if (/fetch/i.test(msg)) return 'Could not reach the server. Check your connection and try again.'
  return msg || 'Something went wrong. Please try again.'
}
