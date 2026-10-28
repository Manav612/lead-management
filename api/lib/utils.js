export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

export function sendError(err, res) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details })
  }
  if (err && err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
    })
  }
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum upload size is 5 MB.' })
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` })
  }
  console.error('[leadflow] unhandled error:', err)
  return res.status(500).json({ error: 'Internal server error' })
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
}
