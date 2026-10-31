// Vercel serverless function — the ONLY file in api/, so Vercel compiles
// exactly one function (the Hobby plan caps a deployment at 12).
//
// Vercel delivers every /api/* request here with the FULL path in req.url
// (e.g. /api/leads) — exactly what the Express app in server/ expects,
// since all its routes are registered with the /api prefix (same as local
// dev, where the Vite proxy forwards /api/* to Express on :3001).
// No rewrite is needed.
import { createApp } from '../server/app.js'

const { app } = createApp()

export default function handler(req, res) {
  app(req, res)
}
