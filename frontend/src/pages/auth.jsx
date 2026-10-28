import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import InputAdornment from '@mui/material/InputAdornment'
import CircularProgress from '@mui/material/CircularProgress'
import BusinessIcon from '@mui/icons-material/Business'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import EmailIcon from '@mui/icons-material/Email'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { supabase, friendlyAuthError } from '../services/supabase'

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, justifyContent: 'center' }}>
      <BusinessIcon color="primary" />
      <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>LeadFlow</Typography>
    </Box>
  )
}

function Shell({ children }) {
  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2,
      background: 'linear-gradient(135deg, #EFF6FF 0%, #F5F7FA 50%, #ECFEFF 100%)'
    }}>
      <Card sx={{ width: '100%', maxWidth: 440 }}>
        <CardContent sx={{ p: 4 }}>
          <Brand />
          {children}
        </CardContent>
      </Card>
    </Box>
  )
}

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required')
})

export function LoginPage() {
  const navigate = useNavigate()
  const { login, mode } = useAuth()
  const [error, setError] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const { register, handleSubmit, formState: { errors }, setError: setF } = useForm({
    resolver: zodResolver(loginSchema)
  })

  const onSubmit = async (v) => {
    setError(null)
    try {
      const user = await login(v.email, v.password)
      navigate(user?.role === 'admin' ? '/admin/dashboard' : '/app/dashboard', { replace: true })
    } catch (e) {
      setF('password', { message: e.message })
      setError(e.message)
    }
  }

  return (
    <Shell>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Sign in to LeadFlow</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage your leads, follow-ups and sales pipeline.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField label="Email" type="email" fullWidth size="small" sx={{ mb: 2 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" /></InputAdornment> }}
          {...register('email')} error={Boolean(errors.email)} helperText={errors.email?.message} />
        <TextField label="Password" type={showPw ? 'text' : 'password'} fullWidth size="small" sx={{ mb: 3 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><LockOutlinedIcon fontSize="small" /></InputAdornment>,
            endAdornment: (
              <InputAdornment position="end">
                <Button size="small" onClick={() => setShowPw((s) => !s)}>{showPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}</Button>
              </InputAdornment>
            )
          }}
          {...register('password')} error={Boolean(errors.password)} helperText={errors.password?.message} />
        <Button type="submit" variant="contained" size="large" fullWidth>SIGN IN</Button>
      </form>
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2"><Link to="/forgot-password" style={{ fontSize: 13 }}>Forgot password?</Link></Typography>
      </Box>
      {mode === 'local-dev' && (
        <Alert severity="info" sx={{ mt: 3 }} icon={false}>
          <b>Local demo mode.</b> Try:<br />
          Admin: admin@leadflow.local / Admin@123<br />
          Employee: priya@leadflow.local / User@123
        </Alert>
      )}
    </Shell>
  )
}

const forgotSchema = z.object({ email: z.string().trim().email('Enter a valid email') })

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(null)
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(forgotSchema) })

  const onSubmit = async (v) => {
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(v.email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) throw new Error(friendlyAuthError(error))
      setSent('If that email exists, a password reset link is on its way.')
    } else {
      const data = await api.post('/api/auth/forgot-password', { email: v.email })
      setSent(data.message)
      if (data.reset_code) setSent(s => `${s}\n\nDemo mode reset code: ${data.reset_code}`)
    }
  }

  if (sent) {
    return (
      <Shell>
        <Alert severity="success" sx={{ mb: 2 }} icon={false} style={{ whiteSpace: 'pre-line' }}>{sent}</Alert>
        <Button fullWidth href="/login" variant="outlined">Back to Sign In</Button>
      </Shell>
    )
  }
  return (
    <Shell>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Reset your password</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter your account email and we'll send you a reset link{supabase ? '' : ' (demo mode shows the code directly)'}.
      </Typography>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField label="Email" type="email" fullWidth size="small" sx={{ mb: 3 }} {...register('email')}
          error={Boolean(errors.email)} helperText={errors.email?.message} />
        <Button type="submit" variant="contained" size="large" fullWidth>Send Reset Link</Button>
      </form>
      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Typography variant="body2"><Link to="/login" style={{ fontSize: 13 }}>Back to Sign In</Link></Typography>
      </Box>
    </Shell>
  )
}

const resetSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  reset_code: z.string().trim().min(1, 'Reset code is required'),
  password: z.string().min(8, 'Minimum 8 characters'),
  confirm: z.string()
}).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const recoveryToken = params.get('access_token')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const { register, handleSubmit, formState: { errors }, reset } = useForm({ resolver: zodResolver(resetSchema) })

  // Supabase recovery link flow: the reset email lands here with an access_token
  useEffect(() => {
    if (supabase && recoveryToken) reset({ email: '', reset_code: '', password: '', confirm: '' })
  }, [supabase, recoveryToken, reset])

  const onSubmit = async (v) => {
    setBusy(true)
    setError(null)
    try {
      if (supabase && recoveryToken) {
        const { error } = await supabase.auth.updateUser({ password: v.password })
        if (error) throw new Error(friendlyAuthError(error))
        setDone(true)
      } else {
        await api.post('/api/auth/reset-password', {
          email: v.email, reset_code: v.reset_code, password: v.password
        })
        setDone(true)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Shell>
        <Alert severity="success" sx={{ mb: 2 }}>Password updated. Please sign in with your new password.</Alert>
        <Button fullWidth variant="contained" onClick={() => navigate('/login')}>Sign In</Button>
      </Shell>
    )
  }

  return (
    <Shell>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Choose a new password</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {supabase && recoveryToken
          ? 'You followed the reset link from your email. Enter your new password below.'
          : 'Enter your email, the reset code from the email, and your new password.'}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {!supabase && (
          <TextField label="Email" fullWidth size="small" sx={{ mb: 2 }} {...register('email')}
            error={Boolean(errors.email)} helperText={errors.email?.message} />
        )}
        {!(supabase && recoveryToken) && (
          <TextField label="Reset Code" fullWidth size="small" sx={{ mb: 2 }} {...register('reset_code')}
            error={Boolean(errors.reset_code)} helperText={errors.reset_code?.message} />
        )}
        <TextField label="New Password" type="password" fullWidth size="small" sx={{ mb: 2 }} {...register('password')}
          error={Boolean(errors.password)} helperText={errors.password?.message} />
        <TextField label="Confirm Password" type="password" fullWidth size="small" sx={{ mb: 3 }} {...register('confirm')}
          error={Boolean(errors.confirm)} helperText={errors.confirm?.message} />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={busy}
          startIcon={busy && <CircularProgress size={16} color="inherit" />}>
          Update Password
        </Button>
      </form>
    </Shell>
  )
}
