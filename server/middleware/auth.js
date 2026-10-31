import { ApiError, asyncHandler } from '../lib/utils.js'
import { verifyLocalToken } from '../lib/localToken.js'

/**
 * Auth middleware bound to a context { store, supabase (nullable), mode, config }.
 * - supabase mode: verifies the Supabase access token via the Admin API
 * - local-dev mode: verifies an HMAC-signed demo token
 * The profile row is always loaded and is_active is enforced here.
 */
export function buildAuthMiddleware({ store, supabase, mode, config }) {
  return asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new ApiError(401, 'Authentication required')

    let userId = null
    let email = null

    if (mode === 'supabase') {
      const { data, error } = await supabase.auth.getUser(token)
      if (error || !data?.user) throw new ApiError(401, 'Invalid or expired session')
      userId = data.user.id
      email = data.user.email
    } else {
      const payload = verifyLocalToken(token, config.appSecret)
      if (!payload) throw new ApiError(401, 'Invalid or expired session')
      userId = payload.sub
      email = payload.email
    }

    const profile = await store.profiles.getProfile(userId)
    if (!profile) throw new ApiError(401, 'Profile not found for this account')
    if (!profile.is_active) throw new ApiError(403, 'This account has been deactivated. Contact your administrator.')

    req.user = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      is_active: profile.is_active
    }
    next()
  })
}

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' })
  }
  next()
}
