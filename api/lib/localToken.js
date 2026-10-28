import crypto from 'node:crypto'

// Local-demo-mode token: base64url(JSON).hmac, 12h expiry.
// Only used when Supabase is NOT configured. Not for production.
const b64url = (buf) => Buffer.from(buf).toString('base64url')

export function signLocalToken({ sub, email }, secret, ttlSeconds = 12 * 60 * 60) {
  const payload = { sub, email, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyLocalToken(token, secret) {
  if (typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.sub || typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function sha256hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function hmacSign(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest('hex')
}

export function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':')
    const test = crypto.scryptSync(String(password), salt, 32).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
  } catch {
    return false
  }
}
