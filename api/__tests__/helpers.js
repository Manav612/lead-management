import { createApp } from '../app.js'
import { resetStoreForTests, getStore } from '../stores/index.js'
import { signLocalToken } from '../lib/localToken.js'
import { config } from '../config.js'

export function newApp() {
  resetStoreForTests()
  const app = createApp()
  return { app: app.app, store: getStore(), ctx: app.ctx }
}

export function tokenFor(user) {
  return signLocalToken({ sub: user.id, email: user.email }, config.appSecret)
}

export async function demoUsers(store) {
  const [admin, priya, arjun] = await Promise.all([
    store.profiles.getProfileByEmail('admin@leadflow.local'),
    store.profiles.getProfileByEmail('priya@leadflow.local'),
    store.profiles.getProfileByEmail('arjun@leadflow.local')
  ])
  return { admin, priya, arjun }
}

export const authHeader = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` })
