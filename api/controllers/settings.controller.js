import { asyncHandler } from '../lib/utils.js'
import { settingsSchema } from '../lib/validators.js'

export function buildSettingsController(ctx) {
  const { store } = ctx

  const get = asyncHandler(async (req, res) => {
    res.json(await store.settings.getSettings())
  })

  const set = asyncHandler(async (req, res) => {
    const data = settingsSchema.parse(req.body)
    await store.settings.setSettings(data)
    res.json({ ok: true })
  })

  return { get, set }
}
