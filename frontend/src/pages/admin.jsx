import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import AddIcon from '@mui/icons-material/Add'
import DownloadIcon from '@mui/icons-material/Download'
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import PaymentsIcon from '@mui/icons-material/Payments'
import EventNoteIcon from '@mui/icons-material/EventNote'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { api, downloadFile } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  PageHeader, StatCard, DataGrid, StatusChip, PriorityChip, LoadingBlock, ErrorBlock,
  EmptyState, SearchField, ConfirmDialog
} from '../components/ui'
import { StatusPie, SourceBar, TrendLine, GenericBar } from '../components/charts'
import { LeadForm } from '../components/forms'
import { fmtDateTime, fmtDate, toLocalInput } from '../utils/dates'
import { formatCurrency, formatNumber } from '../utils/format'
import { toCsv } from '../utils/csv'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../theme'
import ImportWizard from '../features/ImportWizard'
import LeadDetailPage from '../features/LeadDetailPage'

/* ---------------- Dashboard ---------------- */

export function AdminDashboard() {
  const [summary, setSummary] = useState(null)
  const [byStatus, setByStatus] = useState([])
  const [bySource, setBySource] = useState([])
  const [overTime, setOverTime] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, st, so, ot] = await Promise.all([
        api.get('/api/reports/summary'),
        api.get('/api/reports/leads-by-status'),
        api.get('/api/reports/leads-by-source'),
        api.get('/api/reports/leads-over-time?days=90')
      ])
      setSummary(s); setByStatus(st.rows); setBySource(so.rows); setOverTime(ot.rows)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingBlock rows={8} />
  if (error) return <ErrorBlock message={error} onRetry={load} />
  if (!summary) return null

  const wonValue = byStatus.find((r) => r.status === 'won')?.value ?? 0
  const leads90 = overTime.reduce((s, r) => s + (r.count || 0), 0)

  return (
    <Box>
      <PageHeader title="Dashboard" subtitle="Company-wide sales overview" />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><StatCard title="Total Leads" value={formatNumber(summary.total_leads)} icon={<PersonAddIcon />} tone="primary" to="/admin/leads" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Won" value={formatNumber(summary.won_leads)} sub={formatCurrency(wonValue, { compact: true })} icon={<TrendingUpIcon />} tone="success" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Conversion Rate" value={`${summary.conversion_rate}%`} icon={<PaymentsIcon />} tone="secondary" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Pipeline Value" value={formatCurrency(summary.pipeline_value, { compact: true })} icon={<PaymentsIcon />} tone="warning" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Overdue Follow-ups" value={formatNumber(summary.overdue_follow_ups)} icon={<EventNoteIcon />} tone="error" to="/admin/follow-ups?tab=overdue" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Leads (90d)" value={formatNumber(leads90)} icon={<EventNoteIcon />} tone="info" /></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}><StatusPie data={byStatus} /></Grid>
        <Grid item xs={12} md={6}><SourceBar data={bySource} /></Grid>
        <Grid item xs={12}><TrendLine data={overTime.map((r) => ({ date: r.date, count: r.count }))} title="New Leads (last 90 days)" height={300} /></Grid>
      </Grid>
    </Box>
  )
}

/* ---------------- Leads ---------------- */

export function AdminLeads() {
  const navigate = useNavigate()
  const toast = useToast()
  const [filters, setFilters] = useState({ q: '', status: '', priority: '', assigned_to: '', source: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [data, setData] = useState({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState({})
  const [users, setUsers] = useState([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = new URLSearchParams({
        page: String(page), pageSize: String(pageSize), sort: sortKey, dir: sortDir
      })
      if (filters.q) p.set('q', filters.q)
      if (filters.status) p.set('status', filters.status)
      if (filters.priority) p.set('priority', filters.priority)
      if (filters.assigned_to) p.set('assigned_to', filters.assigned_to)
      if (filters.source) p.set('lead_source', filters.source)
      if (filters.from) p.set('date_from', filters.from)
      if (filters.to) p.set('date_to', filters.to)
      setData(await api.get(`/api/leads?${p}`))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [filters, page, pageSize, sortKey, sortDir])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/api/users').then((d) => setUsers(d.rows)).catch(() => {}) }, [])

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }
  const selectedIds = Object.keys(selected)

  const bulkAssign = async () => {
    setBusy(true)
    try {
      await api.post('/api/leads/bulk-assign', { lead_ids: selectedIds, assigned_to: assignTo || null })
      toast.success(`Assigned ${selectedIds.length} lead(s)`)
      setSelected({}); setAssignOpen(false); setAssignTo('')
      load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const columns = [
    { label: 'Lead', key: 'name', sortable: true, render: (l) => (
      <Box>
        <Typography variant="body2" fontWeight={600}>{l.name}</Typography>
        <Typography variant="caption" color="text.secondary">{l.lead_code}</Typography>
      </Box>
    ) },
    { label: 'Company', key: 'company_name' },
    { label: 'Phone', key: 'phone' },
    { label: 'Value', key: 'estimated_deal_value', align: 'right', sortable: true,
      render: (l) => formatCurrency(l.estimated_deal_value) },
    { label: 'Source', key: 'lead_source' },
    { label: 'Priority', key: 'priority', sortable: true, render: (l) => <PriorityChip priority={l.priority} /> },
    { label: 'Status', key: 'status', sortable: true, render: (l) => <StatusChip status={l.status} /> },
    { label: 'Assigned To', key: 'assigned_to_name', render: (l) => l.assigned_to_name || <Chip label="Unassigned" size="small" variant="outlined" /> },
    { label: 'Next Follow-up', key: 'next_follow_up_at', sortable: true, render: (l) => fmtDateTime(l.next_follow_up_at) },
    { label: 'Created', key: 'created_at', sortable: true, render: (l) => fmtDate(l.created_at) }
  ]

  return (
    <Box>
      <PageHeader title="Leads" subtitle={`${data.total} leads total`}
        actions={
          <>
            <Button variant="outlined" startIcon={<DownloadIcon />}
              onClick={() => downloadFile(`/api/leads/export?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))}`, 'leads.csv')}>
              Export CSV
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} component={Link} to="/admin/leads/new">Add Lead</Button>
          </>
        } />

      <Card sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={4}><SearchField value={filters.q} onChange={(v) => setF('q', v)} placeholder="Search name, company, phone…" sx={{ width: '100%' }} /></Grid>
          <Grid item xs={6} sm={2}>
            <TextField select size="small" label="Status" value={filters.status} onChange={(e) => setF('status', e.target.value)} fullWidth>
              <MenuItem value="">All</MenuItem>
              {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField select size="small" label="Priority" value={filters.priority} onChange={(e) => setF('priority', e.target.value)} fullWidth>
              <MenuItem value="">All</MenuItem>
              {PRIORITY_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField select size="small" label="Assigned To" value={filters.assigned_to} onChange={(e) => setF('assigned_to', e.target.value)} fullWidth>
              <MenuItem value="">All</MenuItem>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={1}>
            <TextField type="date" size="small" label="From" value={filters.from} onChange={(e) => setF('from', e.target.value)} fullWidth />
          </Grid>
          <Grid item xs={6} sm={1}>
            <TextField type="date" size="small" label="To" value={filters.to} onChange={(e) => setF('to', e.target.value)} fullWidth />
          </Grid>
        </Grid>
      </Card>

      {selectedIds.length > 0 && (
        <Alert severity="info" sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {selectedIds.length} lead(s) selected
          <Button size="small" variant="contained" startIcon={<AssignmentIndIcon />} onClick={() => setAssignOpen(true)}>
            Bulk Assign
          </Button>
        </Alert>
      )}

      {error ? <ErrorBlock message={error} onRetry={load} /> : (
        <DataGrid
          columns={columns} rows={data.rows} loading={loading}
          pagination={{ page, pageSize, total: data.total, onPageChange: setPage, onPageSizeChange: setPageSize }}
          sortKey={sortKey} sortDir={sortDir}
          onSort={(k) => {
            if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
            else { setSortKey(k); setSortDir('asc') }
          }}
          onRowClick={(l) => navigate(`/admin/leads/${l.id}`)}
          selectable
          selected={selected}
          onToggleSelect={(l) => setSelected((s) => { const n = { ...s }; if (n[l.id]) delete n[l.id]; else n[l.id] = true; return n })}
          onToggleAll={(rows) => setSelected((s) => {
            const all = rows.length > 0 && rows.every((r) => s[r.id])
            const n = { ...s }
            rows.forEach((r) => { if (all) delete n[r.id]; else n[r.id] = true })
            return n
          })}
          empty={<EmptyState title="No leads match your filters" hint="Try clearing some filters, or add a new lead."
            action={<Button variant="contained" size="small" component={Link} to="/admin/leads/new">Add Lead</Button>} />}
        />
      )}

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Bulk Assign {selectedIds.length} Lead(s)</DialogTitle>
        <DialogContent>
          <TextField select label="Assign To" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} fullWidth size="small">
            <MenuItem value="">Unassigned</MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAssignOpen(false)} color="inherit">Cancel</Button>
          <Button variant="contained" disabled={busy} onClick={bulkAssign}>Assign</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export function AdminLeadNew() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get('/api/users').then((d) => setUsers(d.rows)).catch(() => {}) }, [])

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <PageHeader title="Add Lead" subtitle="Manually create a new lead" />
      <Card>
        <CardContent>
          <LeadForm
            canAssign
            assignedOptions={users}
            sources={['Website', 'Referral', 'Cold Call', 'Social Media', 'Advertisement', 'Event']}
            busy={busy}
            submitLabel="Create Lead"
            onSubmit={async (v) => {
              setBusy(true)
              try {
                const d = await api.post('/api/leads', {
                  ...v,
                  estimated_deal_value: v.estimated_deal_value === '' ? null : Number(v.estimated_deal_value),
                  assigned_to: v.assigned_to || null
                })
                toast.success(`Lead ${d.lead.lead_code} created`)
                navigate(`/admin/leads/${d.lead.id}`)
              } catch (e) { toast.error(e.message) } finally { setBusy(false) }
            }}
          />
        </CardContent>
      </Card>
    </Box>
  )
}

export const AdminLeadDetail = () => <LeadDetailPage isAdmin />

/* ---------------- Import ---------------- */

export const ImportPage = () => <ImportWizard />

export function ImportHistory() {
  const navigate = useNavigate()
  const [data, setData] = useState({ rows: [], total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorBatch, setErrorBatch] = useState(null)
  const [errors, setErrors] = useState([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await api.get(`/api/imports?page=${page}&pageSize=20`)) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [page])
  useEffect(() => { load() }, [load])

  const columns = [
    { label: 'Batch', key: 'id', render: (b) => <Typography variant="caption" fontFamily="monospace">{b.id}</Typography> },
    { label: 'Uploaded By', key: 'uploaded_by_name' },
    { label: 'Total', key: 'total_rows', align: 'right' },
    { label: 'Imported', key: 'imported_count', align: 'right', render: (b) => <Chip label={b.imported_count} color="success" size="small" /> },
    { label: 'Skipped Dups', key: 'skipped_duplicates', align: 'right' },
    { label: 'Failed', key: 'failed_count', align: 'right', render: (b) => <Chip label={b.failed_count} color={b.failed_count ? 'error' : 'default'} size="small" /> },
    { label: 'When', key: 'created_at', render: (b) => fmtDateTime(b.created_at) },
    { label: '', key: 'a', align: 'right', render: (b) => (
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
        <Button size="small" onClick={async () => {
          setErrorBatch(b); setLoading(true)
          try { setErrors((await api.get(`/api/imports/${b.id}/errors`)).rows) } finally { setLoading(false) }
        }}>Errors</Button>
        <Button size="small" variant="outlined" onClick={() => downloadFile(`/api/imports/${b.id}/error-report`, `import-errors-${b.id}.csv`)}>
          CSV
        </Button>
      </Box>
    ) }
  ]

  return (
    <Box>
      <PageHeader title="Import History" subtitle="Every import batch and its results" />
      {error ? <ErrorBlock message={error} onRetry={load} /> : (
        <DataGrid columns={columns} rows={data.rows} loading={loading}
          pagination={{ page, pageSize: 20, total: data.total, onPageChange: setPage }}
          empty={<EmptyState title="No imports yet" hint="Import your first batch from the Import Leads page."
            action={<Button variant="contained" size="small" component={Link} to="/admin/import">Import Leads</Button>} />} />
      )}
      <Dialog open={Boolean(errorBatch)} onClose={() => setErrorBatch(null)} maxWidth="md" fullWidth>
        <DialogTitle>Import Errors</DialogTitle>
        <DialogContent>
          {errors.length === 0
            ? <Alert severity="success">No errors in this batch.</Alert>
            : (
              <TableContainer sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow><TableCell>Row</TableCell><TableCell>Errors</TableCell><TableCell>Raw Data</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {errors.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.row_number}</TableCell>
                        <TableCell sx={{ maxWidth: 300 }}><Typography variant="body2">{(e.error_messages || []).join('; ')}</Typography></TableCell>
                        <TableCell sx={{ maxWidth: 300 }}><Typography variant="caption" component="div" sx={{ wordBreak: 'break-all' }}>{JSON.stringify(e.raw_row_data || {})}</Typography></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {errorBatch && errorBatch.failed_count > 0 && (
            <Button startIcon={<DownloadIcon />} onClick={() => downloadFile(`/api/imports/${errorBatch.id}/error-report`, `import-errors-${errorBatch.id}.csv`)}>
              Download Error Report
            </Button>
          )}
          <Button onClick={() => setErrorBatch(null)} color="inherit">Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

/* ---------------- Reports ---------------- */

export function AdminReports() {
  const [summary, setSummary] = useState(null)
  const [performance, setPerformance] = useState([])
  const [lost, setLost] = useState([])
  const [byStatus, setByStatus] = useState([])
  const [bySource, setBySource] = useState([])
  const [overTime, setOverTime] = useState([])
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, p, l, st, so, ot] = await Promise.all([
        api.get('/api/reports/summary'),
        api.get('/api/reports/performance'),
        api.get('/api/reports/lost-reasons'),
        api.get('/api/reports/leads-by-status'),
        api.get('/api/reports/leads-by-source'),
        api.get(`/api/reports/leads-over-time?days=${days}`)
      ])
      setSummary(s); setPerformance(p.rows); setLost(l.rows); setByStatus(st.rows); setBySource(so.rows); setOverTime(ot.rows)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])

  if (loading) return <LoadingBlock rows={8} />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  return (
    <Box>
      <PageHeader title="Reports" subtitle="Pipeline, performance and insights"
        actions={
          <>
            <TextField select size="small" label="Trend period" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={{ minWidth: 140 }}>
              <MenuItem value={30}>Last 30 days</MenuItem>
              <MenuItem value={90}>Last 90 days</MenuItem>
              <MenuItem value={180}>Last 180 days</MenuItem>
            </TextField>
            <Button variant="outlined" startIcon={<DownloadIcon />}
              onClick={() => downloadFile('/api/reports/export?type=status', 'leads-by-status.csv')}>Status CSV</Button>
            <Button variant="outlined" startIcon={<DownloadIcon />}
              onClick={() => downloadFile('/api/reports/export?type=source', 'leads-by-source.csv')}>Source CSV</Button>
            <Button variant="outlined" startIcon={<DownloadIcon />}
              onClick={() => downloadFile('/api/reports/export?type=performance', 'employee-performance.csv')}>Performance CSV</Button>
          </>
        } />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><StatCard title="Total Leads" value={formatNumber(summary.total_leads)} icon={<PersonAddIcon />} tone="primary" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Won / Lost" value={`${formatNumber(summary.won)} / ${formatNumber(summary.lost)}`} icon={<TrendingUpIcon />} tone="success" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Conversion Rate" value={`${summary.conversion_rate}%`} icon={<TrendingUpIcon />} tone="secondary" /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Total Pipeline" value={formatCurrency(summary.pipeline_value, { compact: true })} icon={<PaymentsIcon />} tone="warning" /></Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}><StatusPie data={byStatus} /></Grid>
        <Grid item xs={12} md={6}><SourceBar data={bySource} /></Grid>
        <Grid item xs={12}><TrendLine data={overTime.map((r) => ({ date: r.date, count: r.count }))} title={`New Leads (last ${days} days)`} height={300} /></Grid>
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Employee Performance</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell><TableCell align="right">Assigned</TableCell><TableCell align="right">Won</TableCell>
                  <TableCell align="right">Lost</TableCell><TableCell align="right">Conversion</TableCell>
                  <TableCell align="right">Pipeline Value</TableCell><TableCell align="right">Overdue F/U</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {performance.map((p) => (
                  <TableRow key={p.id || p.name}>
                    <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                    <TableCell align="right">{p.assigned}</TableCell>
                    <TableCell align="right">{p.won}</TableCell>
                    <TableCell align="right">{p.lost}</TableCell>
                    <TableCell align="right">{p.conversion_rate}%</TableCell>
                    <TableCell align="right">{formatCurrency(p.pipeline_value)}</TableCell>
                    <TableCell align="right"><Chip label={p.overdue_follow_ups} size="small" color={p.overdue_follow_ups ? 'error' : 'default'} variant={p.overdue_follow_ups ? 'filled' : 'outlined'} /></TableCell>
                  </TableRow>
                ))}
                {performance.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState title="No employees yet" /></TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Lost Reasons</Typography>
          {lost.length === 0
            ? <EmptyState title="No lost leads yet" />
            : (
              <GenericBar data={lost.map((l) => ({ name: l.reason, count: l.count }))} xKey="name"
                bars={[{ key: 'count', fill: '#EF4444', name: 'Lost leads' }]} title="Leads Lost by Reason" />
            )}
        </CardContent>
      </Card>
    </Box>
  )
}

/* ---------------- Users ---------------- */

const userFormInitial = { full_name: '', email: '', password: '', role: 'user' }

export function UsersPage() {
  const toast = useToast()
  const { user: me } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {mode:'create'} | {mode:'edit', user}
  const [form, setForm] = useState(userFormInitial)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows((await api.get('/api/users')).rows) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm(userFormInitial); setDialog({ mode: 'create' }) }
  const openEdit = (u) => { setForm({ full_name: u.full_name, email: u.email, password: '', role: u.role }); setDialog({ mode: 'edit', user: u }) }

  const submit = async () => {
    setBusy(true)
    try {
      if (dialog.mode === 'create') {
        await api.post('/api/users', form)
        toast.success('User created')
      } else {
        const payload = { full_name: form.full_name, role: form.role, is_active: dialog.user.is_active }
        if (form.password) payload.password = form.password
        await api.patch(`/api/users/${dialog.user.id}`, payload)
        toast.success('User updated')
      }
      setDialog(null)
      load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const toggleActive = async (u) => {
    try {
      await api.patch(`/api/users/${u.id}`, { is_active: !u.is_active })
      toast.success(u.is_active ? 'User deactivated' : 'User activated')
      load()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Box>
      <PageHeader title="Users" subtitle="Manage employee and admin accounts"
        actions={<Button variant="contained" startIcon={<PersonAddIcon />} onClick={openCreate}>Add User</Button>} />
      {error ? <ErrorBlock message={error} onRetry={load} /> : (
        <DataGrid
          loading={loading}
          rows={rows}
          columns={[
            { label: 'Name', key: 'full_name', render: (u) => (
              <Box>
                <Typography variant="body2" fontWeight={600}>{u.full_name}</Typography>
                {u.id === me.id && <Chip label="you" size="small" sx={{ ml: 1 }} />}
              </Box>
            ) },
            { label: 'Email', key: 'email' },
            { label: 'Role', key: 'role', render: (u) => <Chip label={u.role === 'admin' ? 'Admin' : 'Employee'} size="small" color={u.role === 'admin' ? 'secondary' : 'default'} /> },
            { label: 'Status', key: 'is_active', render: (u) => <Chip label={u.is_active ? 'Active' : 'Inactive'} size="small" color={u.is_active ? 'success' : 'default'} variant={u.is_active ? 'filled' : 'outlined'} /> },
            { label: '', key: 'a', align: 'right', render: (u) => (
              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => openEdit(u)}>Edit</Button>
                {u.id !== me.id && (
                  <Button size="small" color={u.is_active ? 'error' : 'success'} variant="outlined" onClick={() => toggleActive(u)}>
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                )}
              </Box>
            ) }
          ]}
          empty={<EmptyState title="No users yet" />}
        />
      )}

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog?.mode === 'create' ? 'Add User' : 'Edit User'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Full Name" size="small" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            <TextField label="Email" type="email" size="small" value={form.email} disabled={dialog?.mode === 'edit'}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <TextField label={dialog?.mode === 'create' ? 'Password' : 'New Password (optional)'} type="password" size="small"
              value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              helperText={dialog?.mode === 'create' ? 'Minimum 8 characters' : 'Leave blank to keep current password'} />
            <TextField select label="Role" size="small" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <MenuItem value="user">Employee</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(null)} color="inherit">Cancel</Button>
          <Button variant="contained" disabled={busy || !form.full_name || !form.email} onClick={submit}>
            {dialog?.mode === 'create' ? 'Create User' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

/* ---------------- Settings ---------------- */

export function SettingsPage() {
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newSource, setNewSource] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setSettings(await api.get('/api/settings')) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const saveSources = async (sources) => {
    setBusy(true)
    try {
      await api.post('/api/settings', { lead_sources: sources })
      toast.success('Settings saved')
      load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <PageHeader title="Settings" subtitle="Configure the lead sources used across the app" />
      {error ? <ErrorBlock message={error} onRetry={load} /> : loading ? <LoadingBlock rows={6} /> : (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Lead Sources</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
              {(settings.lead_sources || []).map((s) => (
                <Chip key={s} label={s} onDelete={() => saveSources((settings.lead_sources || []).filter((x) => x !== s))} size="medium" />
              ))}
              {(settings.lead_sources || []).length === 0 && (
                <Typography variant="body2" color="text.secondary">No sources configured.</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" label="Add a lead source" value={newSource} onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSource.trim()) {
                    e.preventDefault()
                    if (!(settings.lead_sources || []).includes(newSource.trim())) {
                      saveSources([...(settings.lead_sources || []), newSource.trim()])
                      setNewSource('')
                    }
                  }
                }} />
              <Button variant="contained" disabled={busy || !newSource.trim()}
                onClick={() => { saveSources([...(settings.lead_sources || []), newSource.trim()]); setNewSource('') }}>
                Add
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
