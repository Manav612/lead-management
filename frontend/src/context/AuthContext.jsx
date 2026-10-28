import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getToken, setToken } from '../services/api'
import { supabase, friendlyAuthError } from '../services/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading') // loading | authed | guest
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState(null)
  const navigate = useNavigate()
  const meInFlight = useRef(false)

  const clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    setStatus('guest')
  }, [])

  const fetchMe = useCallback(async () => {
    if (meInFlight.current) return null
    meInFlight.current = true
    try {
      const data = await api.get('/api/me')
      setUser(data.user)
      setStatus('authed')
      return data.user
    } catch {
      setToken(null)
      setUser(null)
      setStatus('guest')
      return null
    } finally {
      meInFlight.current = false
    }
  }, [])

  useEffect(() => {
    let unSub = null
    const boot = async () => {
      try {
        const health = await api.get('/api/health')
        setMode(health.mode)
      } catch {
        setMode(null)
      }
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        if (data?.session?.access_token) setToken(data.session.access_token)
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.access_token) setToken(session.access_token)
          if (!session) {
            clearSession()
            return
          }
          fetchMe()
        })
        unSub = () => sub.subscription.unsubscribe()
        await fetchMe()
      } else {
        await fetchMe()
      }
    }
    boot()
    return () => unSub && unSub()
  }, [fetchMe, clearSession])

  // expired token anywhere → back to login
  useEffect(() => {
    const onUnauthorized = () => {
      clearSession()
      navigate('/login', { replace: true })
    }
    window.addEventListener('leadflow:unauthorized', onUnauthorized)
    return () => window.removeEventListener('leadflow:unauthorized', onUnauthorized)
  }, [clearSession, navigate])

  const login = useCallback(async (email, password) => {
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(friendlyAuthError(error))
    } else {
      const data = await api.post('/api/auth/login', { email, password })
      setToken(data.token)
    }
    const u = await fetchMe()
    if (!u) throw new Error('Signed in, but could not load your profile. Please try again.')
    return u
  }, [fetchMe])

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    clearSession()
    navigate('/login', { replace: true })
  }, [clearSession, navigate])

  const value = useMemo(() => ({
    status, user, mode,
    isAuthenticated: status === 'authed',
    isAdmin: user?.role === 'admin',
    login, logout, fetchMe
  }), [status, user, mode, login, logout, fetchMe])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
