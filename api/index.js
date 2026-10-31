import { createApp } from './app.js'
import { appConfig as config, mode } from './config.js'

const { app } = createApp()

app.listen(config.port, () => {
  console.log(`[leadflow] API listening on http://localhost:${config.port} (mode: ${mode})`)
  if (mode === 'local-dev') {
    console.log('[leadflow] LOCAL DEMO MODE: in-memory data, demo accounts admin@leadflow.local / Admin@123')
  }
})
