import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import PaymentsIcon from '@mui/icons-material/Payments'
import EventNoteIcon from '@mui/icons-material/EventNote'
import AddIcon from '@mui/icons-material/Add'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PageHeader, StatCard, DataGrid, StatusChip, PriorityChip, LoadingBlock, ErrorBlock, EmptyState, SearchField } from '../components/ui'
import { TrendLine, StatusPie } from '../components/charts'
import { LeadForm } from '../components/forms'
import { fmtDateTime, fmtDate } from '../utils/dates'
import { formatCurrency, formatNumber } from '../utils/format'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../theme'
import LeadDetailPage from '../features/LeadDetailPage'
import FollowUpsShared from '../features/FollowUpsShared'
import CalendarShared from '../features/CalendarShared'

/* ---------------- Dashboard ---------------- */

export function UserDashboard() {
  const [summary, setSummary] = useState(null)
  const [byStatus, setByStatus] = useState([])
  const [overTime, setOverTime] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user } = useAuth()

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, st, ot] = await Promise.all([
        api.get('/api/reports/summary'),
        api.get('/api/reports/leads-by-status'),
        api.get('/api/reports/leads-over-time?days=90')
      ])
      setSummary(s); setByStatus(st.rows); setOverTime(ot.rows)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <LoadingBlock rows={8} />
  if (error) return <ErrorBlock message={error} onRetry={load} />
  if (!summary) return null

  return (
    <Box>
      <PageHeader title={`Welcome back, ${user?.full_name?.split(' ')[0] || 'there'} 👋`}
        subtitle="Here's how your pipeline is doing"
        actions={<Button variant="contained" startIcon={<AddIcon />} component={Link} to="/app/leads/new">Add Lead</Button>} />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><StatCard title="My Leads" value={formatNumber(summary.total_leads)} icon={<PersonAddIcon />} tone="primary" to="/app/leads" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Won" value={formatNumber(summary.won)} sub={formatCurrency(summary.won_value, { compact: true })} icon={<TrendingUpIcon />} tone="success" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Conversion Rate" value={`${summary.conversion_rate}%`} icon={<PaymentsIcon />} tone="secondary" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Overdue Follow-ups" value={formatNumber(summary.overdue_follow_ups)} icon={<EventNoteIcon />} tone="error" to="/app/follow-ups?tab=overdue" /></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}><StatusPie data={byStatus} /></Grid>
        <Grid item xs={12} md={6}><TrendLine data={overTime.map((r) => ({ date: r.date, count: r.count }))} title="My New Leads (90d)" /></Grid>
      </Grid>
    </Box>
  )
}

/* ---------------- Leads ---------------- */

export function UserLeads() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ q: '', status: '', priority: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [data, setData] = useState({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sortKey, dir: sortDir })
      if (filters.q) p.set('q', filters.q)
      if (filters.status) p.set('status', filters.status)
      if (filters.priority) p.set('priority', filters.priority)
      setData(await api.get(`/api/leads?${p}`))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [filters, page, pageSize, sortKey, sortDir])
  useEffect(() => { load() }, [load])

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }

  const columns = [
    { label: 'Lead', key: 'name', sortable: true, render: (l) => (
      <Box>
        <Typography variant="body2" fontWeight={600}>{l.name}</Typography>
        <Typography variant="caption" color="text.secondary">{l.lead_code}</Typography>
      </Box>
    ) },
    { label: 'Company', key: 'company_name' },
    { label: 'Phone', key: 'phone' },
    { label: 'Value', key: 'estimated_deal_value', align: 'right', render: (l) => formatCurrency(l.estimated_deal_value) },
    { label: 'Priority', key: 'priority', sortable: true, render: (l) => <PriorityChip priority={l.priority} /> },
    { label: 'Status', key: 'status', sortable: true, render: (l) => <StatusChip status={l.status} /> },
    { label: 'Next Follow-up', key: 'next_follow_up_at', sortable: true, render: (l) => fmtDateTime(l.next_follow_up_at) },
    { label: 'Created', key: 'created_at', sortable: true, render: (l) => fmtDate(l.created_at) }
  ]

  return (
    <Box>
      <PageHeader title="My Leads" subtitle="Leads assigned to you"
        actions={<Button variant="contained" startIcon={<AddIcon />} component={Link} to="/app/leads/new">Add Lead</Button>} />
      <Card sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={5}><SearchField value={filters.q} onChange={(v) => setF('q', v)} placeholder="Search name, company, phone…" sx={{ width: '100%' }} /></Grid>
          <Grid item xs={6} sm={3}>
            <TextField select size="small" label="Status" value={filters.status} onChange={(e) => setF('status', e.target.value)} fullWidth>
              <MenuItem value="">All</MenuItem>
              {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField select size="small" label="Priority" value={filters.priority} onChange={(e) => setF('priority', e.target.value)} fullWidth>
              <MenuItem value="">All</MenuItem>
              {PRIORITY_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Card>
      {error ? <ErrorBlock message={error} onRetry={load} /> : (
        <DataGrid columns={columns} rows={data.rows} loading={loading}
          pagination={{ page, pageSize, total: data.total, onPageChange: setPage, onPageSizeChange: setPageSize }}
          sortKey={sortKey} sortDir={sortDir}
          onSort={(k) => { if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc') } }}
          onRowClick={(l) => navigate(`/app/leads/${l.id}`)}
          empty={<EmptyState title="No leads assigned to you yet" hint="Ask an admin to assign leads, or add your own."
            action={<Button variant="contained" size="small" component={Link} to="/app/leads/new">Add Lead</Button>} />} />
      )}
    </Box>
  )
}

export function UserLeadNew() {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <PageHeader title="Add Lead" subtitle="New leads are assigned to you automatically" />
      <Card>
        <CardContent>
          <LeadForm
            sources={['Website', 'Referral', 'Cold Call', 'Social Media', 'Advertisement', 'Event']}
            busy={busy}
            submitLabel="Create Lead"
            onSubmit={async (v) => {
              setBusy(true)
              try {
                const d = await api.post('/api/leads', {
                  ...v,
                  estimated_deal_value: v.estimated_deal_value === '' ? null : Number(v.estimated_deal_value)
                })
                toast.success(`Lead ${d.lead.lead_code} created`)
                navigate(`/app/leads/${d.lead.id}`)
              } catch (e) { toast.error(e.message) } finally { setBusy(false) }
            }}
          />
        </CardContent>
      </Card>
    </Box>
  )
}

export const UserLeadDetail = () => <LeadDetailPage />
export const UserFollowUps = () => <FollowUpsShared />
export const UserCalendar = () => <CalendarShared />

/* ---------------- Notifications ---------------- */

export function NotificationsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState({ rows: [], total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '30' })
      if (unreadOnly) p.set('unreadOnly', 'true')
      setData(await api.get(`/api/notifications?${p}`))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [page, unreadOnly])
  useEffect(() => { load() }, [load])

  const markRead = async (n) => {
    try {
      await api.patch(`/api/notifications/${n.id}/read`)
      load()
    } catch { /* ignore */ }
  }

  return (
    <Box>
      <PageHeader title="Notifications" subtitle="Reminders, assignment updates and follow-up alerts"
        actions={
          <Button size="small" variant={unreadOnly ? 'contained' : 'outlined'}
            onClick={() => { setUnreadOnly(!unreadOnly); setPage(1) }}>
            {unreadOnly ? 'Showing unread' : 'Show unread only'}
          </Button>
        } />
      {error ? <ErrorBlock message={error} onRetry={load} /> : loading ? <LoadingBlock rows={6} /> : (
        <Card>
          {data.rows.length === 0
            ? <EmptyState title="No notifications" hint="Follow-up reminders and updates will appear here." />
            : data.rows.map((n) => (
              <Box key={n.id} onClick={() => !n.is_read && markRead(n)}
                onDoubleClick={() => n.lead_id && navigate(`/app/leads/${n.lead_id}`)}
                sx={{ p: 2, borderBottom: '1px solid #F1F5F9', cursor: n.is_read ? 'default' : 'pointer',
                  bgcolor: n.is_read ? 'transparent' : 'rgba(37,99,235,0.04)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={n.is_read ? 500 : 700}>
                      {n.is_read ? '' : '● '} {n.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{n.message}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmtDateTime(n.created_at)}</Typography>
                  </Box>
                  {n.lead_id && (
                    <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); if (!n.is_read) markRead(n); navigate(`/app/leads/${n.lead_id}`) }}>
                      Open Lead
                    </Button>
                  )}
                </Box>
              </Box>
            ))}
        </Card>
      )}
    </Box>
  )
}

/* ---------------- Profile ---------------- */

export function ProfilePage() {
  const toast = useToast()
  const { user, fetchMe } = useAuth()
  const [name, setName] = useState(user?.full_name || '')
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)

  const saveName = async () => {
    setBusy(true)
    try {
      await api.patch(`/api/users/${user.id}`, { full_name: name })
      await fetchMe()
      toast.success('Profile updated')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const changePassword = async () => {
    if (pw.next.length < 8) return toast.error('New password must be at least 8 characters')
    if (pw.next !== pw.confirm) return toast.error('Passwords do not match')
    setBusy(true)
    try {
      await api.patch(`/api/users/${user.id}`, { password: pw.next })
      setPw({ current: '', next: '', confirm: '' })
      toast.success('Password changed')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto' }}>
      <PageHeader title="My Profile" subtitle="Your account details" />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Account</Typography>
          <TextField label="Full Name" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2 }} />
          <TextField label="Email" size="small" fullWidth value={user?.email || ''} disabled sx={{ mb: 2 }} />
          <Button variant="contained" onClick={saveName} disabled={busy || !name.trim()}>Save Profile</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Change Password</Typography>
          <TextField label="New Password" type="password" size="small" fullWidth value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} sx={{ mb: 2 }} helperText="Minimum 8 characters" />
          <TextField label="Confirm New Password" type="password" size="small" fullWidth value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} sx={{ mb: 2 }} />
          <Button variant="outlined" onClick={changePassword} disabled={busy || !pw.next}>Change Password</Button>
        </CardContent>
      </Card>
    </Box>
  )
}
