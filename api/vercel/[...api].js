// Vercel Function wrapper: mounts the same Express app used for local dev.
// vercel.json rewrites /api/* to this function, so the frontend uses the
// same relative /api URLs in production as it does behind the Vite proxy.
import { createApp } from '../app.js'

const { app } = createApp()

export default function handler(req, res) {
  app(req, res)
}
