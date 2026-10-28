import { createLocalStore, seedLocalStore } from './localStore.js'
import { createSupabaseStore } from './supabaseStore.js'
import { config, isSupabaseConfigured } from '../config.js'

let cached = null

export function getStore() {
  if (cached) return cached
  if (isSupabaseConfigured()) {
    cached = createSupabaseStore(config.supabaseUrl, config.supabaseServiceRoleKey)
  } else {
    cached = createLocalStore()
    seedLocalStore(cached)
    console.log('[leadflow] No Supabase credentials found — running in LOCAL DEMO MODE (in-memory data).')
  }
  return cached
}

export function resetStoreForTests() {
  cached = null
}
