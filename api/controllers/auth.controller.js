import crypto from 'node:crypto'
import { ApiError } from '../lib/utils.js'
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../lib/validators.js'
import { signLocalToken, verifyPassword, hashPassword } from '../lib/localToken.js'

export function buildAuthController(ctx) {
  const { store, mode, config, supabase } = ctx

  async function login(req, res) {
    if (mode === 'supabase') {
      throw new ApiError(400, 'Sign in is handled directly by Supabase Auth in this deployment. Use the login form — it talks to Supabase from your browser.')
    }
    const { email, password } = loginSchema.parse(req.body)
    const profile = await store.profiles.getProfileByEmail(email)
    if (!profile || !profile.passwordHash || !verifyPassword(password, profile.passwordHash)) {
      throw new ApiError(401, 'Invalid email or password')
    }
    if (!profile.is_active) throw new ApiError(403, 'This account has been deactivated. Contact your administrator.')
    const token = signLocalToken({ sub: profile.id, email: profile.email }, config.appSecret)
    res.json({
      token,
      user: { id: profile.id, email: profile.email, full_name: profile.full_name, role: profile.role }
    })
  }

  async function forgotPassword(req, res) {
    const { email } = forgotPasswordSchema.parse(req.body)
    if (mode === 'supabase') {
      // In production the browser calls supabase.auth.resetPasswordForEmail();
      // this endpoint exists for parity and to keep the UI flow uniform.
      res.json({ message: 'If the account exists, a password reset email has been requested. Check your inbox.' })
      return
    }
    const profile = await store.profiles.getProfileByEmail(email)
    if (!profile) {
      // Do not reveal whether the email exists
      res.json({ message: 'If the account exists, a password reset email has been requested. Check your inbox.' })
      return
    }
    const code = String(crypto.randomInt(100000, 999999))
    store.state.resetCodes[profile.email.toLowerCase()] = { code, exp: Date.now() + 30 * 60 * 1000 }
    res.json({
      message: 'Reset code generated. In local demo mode the code is shown here instead of being emailed.',
      reset_code: code
    })
  }

  async function resetPassword(req, res) {
    const { email, code, password } = resetPasswordSchema.parse(req.body)
    if (mode === 'supabase') {
      throw new ApiError(400, 'Password reset is handled by the email link from Supabase Auth in this deployment.')
    }
    const stored = store.state.resetCodes[email.toLowerCase()]
    if (!stored || stored.exp < Date.now() || stored.code !== code) {
      throw new ApiError(400, 'Invalid or expired reset code')
    }
    const profile = await store.profiles.getProfileByEmail(email)
    if (!profile) throw new ApiError(404, 'Account not found')
    await store.profiles.updateProfile(profile.id, { password })
    delete store.state.resetCodes[email.toLowerCase()]
    res.json({ message: 'Password updated. You can now sign in with your new password.' })
  }

  async function me(req, res) {
    res.json({
      mode,
      user: {
        id: req.user.id,
        email: req.user.email,
        full_name: req.user.full_name,
        role: req.user.role,
        is_active: req.user.is_active
      }
    })
  }

  return { login, forgotPassword, resetPassword, me }
}
