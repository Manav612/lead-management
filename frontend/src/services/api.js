import { API_BASE } from '../config'

const TOKEN_KEY = 'leadflow_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request(path, { method = 'GET', body, formData, headers = {}, raw = false } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...headers
    },
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined
  })
  if (raw) return res
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    setToken(null)
    window.dispatchEvent(new Event('leadflow:unauthorized'))
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details)
  return data
}

export const api = {
  get: (p) => request(p),
  post: (p, b) => request(p, { method: 'POST', body: b }),
  patch: (p, b) => request(p, { method: 'PATCH', body: b }),
  postForm: (p, fd) => request(p, { method: 'POST', formData: fd }),
  raw: (p, opts = {}) => request(p, { ...opts, raw: true })
}

export async function downloadFile(path, filename, { method = 'GET', formData } = {}) {
  const res = await request(path, { method, formData, raw: true })
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
