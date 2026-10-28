import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import IconButton from '@mui/material/IconButton'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EventIcon from '@mui/icons-material/Event'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PageHeader, DataGrid, EmptyState, LoadingBlock, ErrorBlock, StatusChip } from '../components/ui'
import { FollowUpForm } from '../components/forms'
import { fmtDateTime, relative, isOverdue, toLocalInput } from '../utils/dates'

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' }
]

export default function FollowUpsShared({ isAdmin = false }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState(TABS.find((t) => t.key === params.get('tab'))?.key || 'today')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState({ rows: [], total: 0 })
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [leads, setLeads] = useState([])
  const [assignedUsers, setAssignedUsers] = useState([])
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [completeTarget, setCompleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) })
      if (isAdmin && assigneeFilter) params.set('assigned_to', assigneeFilter)
      const [d, c] = await Promise.all([
        api.get(`/api/follow-ups?${params}`),
        api.get('/api/follow-ups/pending-counts')
      ])
      setData(d)
      setCounts(c.counts || {})
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [tab, page, pageSize, isAdmin, assigneeFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    // full lead list for the create dialog (bounded)
    api.get('/api/leads?pageSize=200&sort=name&dir=asc').then((d) => setLeads(d.rows)).catch(() => {})
    if (isAdmin) api.get('/api/users').then((d) => setAssignedUsers(d.rows)).catch(() => {})
  }, [isAdmin])

  const openLead = (f) => navigate(isAdmin ? `/admin/leads/${f.lead_id}` : `/app/leads/${f.lead_id}`)

  const columns = [
    { label: 'Lead', key: 'lead', sortable: true, render: (f) => (
      <Box component="span">
        <Typography component="span" variant="body2" fontWeight={600}>{f.lead_name}</Typography>
        <Typography component="span" variant="caption" color="text.secondary">{f.lead_code}</Typography>
      </Box>
    ) },
    { label: 'Title', key: 'title', render: (f) => f.title },
    { label: 'Type', key: 'follow_up_type', render: (f) => f.follow_up_type },
    { label: 'Due', key: 'due_at', sortable: true, render: (f) => (
      <Typography variant="body2" color={f.status === 'pending' && isOverdue(f.due_at) ? 'error.main' : 'text.primary'}
        sx={{ fontWeight: f.status === 'pending' && isOverdue(f.due_at) ? 700 : 400 }}>
        {fmtDateTime(f.due_at)}
      </Typography>
    ) },
    { label: 'Relative', key: 'rel', render: (f) => <Typography variant="caption" color="text.secondary">{relative(f.due_at)}</Typography> },
    ...(isAdmin ? [{ label: 'Assignee', key: 'assignee_name', render: (f) => f.assignee_name || '—' }] : []),
    { label: 'Status', key: 'status', render: (f) => <StatusChip status={f.status === 'pending' ? 'follow_up' : f.status === 'completed' ? 'won' : 'on_hold'} /> },
    { label: '', key: 'actions', align: 'right', render: (f) => f.status === 'pending' && (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
        <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
          onClick={() => setCompleteTarget(f)}>Complete</Button>
        <IconButton size="small" aria-label="Open lead" onClick={() => openLead(f)}>
          <EventIcon fontSize="small" />
        </IconButton>
      </Box>
    ) }
  ]

  return (
    <Box>
      <PageHeader title="Follow-ups" subtitle="Stay on top of every promised follow-up"
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Schedule Follow-up</Button>} />

      <Card sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2 }}>
          <Tabs value={tab} onChange={(_e, v) => { setTab(v); setPage(1) }}
            variant="scrollable" allowScrollButtonsMobile sx={{ minHeight: 52 }}>
            {TABS.map((t) => (
              <Tab key={t.key} value={t.key} label={
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {t.label}
                  {counts[t.key] !== undefined && counts[t.key] > 0 && (
                    <Chip label={counts[t.key]} size="small" color={t.key === 'overdue' ? 'error' : 'default'}
                      variant={t.key === 'overdue' ? 'filled' : 'outlined'} />
                  )}
                </Box>
              } />
            ))}
          </Tabs>
          {isAdmin && (
            <TextField select size="small" label="Assignee" value={assigneeFilter}
              onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1) }} sx={{ ml: 'auto', minWidth: 170 }}>
              <MenuItem value="">All</MenuItem>
              {assignedUsers.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
            </TextField>
          )}
        </Box>
      </Card>

      {error ? <ErrorBlock message={error} onRetry={load} /> : (
        <DataGrid
          columns={columns}
          rows={data.rows}
          loading={loading}
          pagination={{ page, pageSize, total: data.total, onPageChange: setPage, onPageSizeChange: setPageSize }}
          onRowClick={openLead}
          sortKey={tab === 'overdue' ? 'due_at' : undefined}
          sortDir="asc"
          empty={
            tab === 'overdue'
              ? <EmptyState title="No overdue follow-ups 🎉" hint="Everything is on schedule. Great job!" />
              : tab === 'today'
                ? <EmptyState title="Nothing due today" hint="Schedule a follow-up to keep the pipeline moving."
                    action={<Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Schedule</Button>} />
                : undefined
          }
        />
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule Follow-up</DialogTitle>
        <DialogContent>
          <FollowUpForm
            leads={leads.length ? leads : [{ id: '__all__', name: 'Loading leads…' }]}
            busy={busy}
            canAssign={isAdmin}
            assignedOptions={assignedUsers}
            onSubmit={async (v) => {
              setBusy(true)
              try {
                await api.post('/api/follow-ups', {
                  lead_id: v.lead_id, title: v.title, description: v.description,
                  follow_up_type: v.follow_up_type, due_at: v.due_at,
                  reminder_at: v.reminder_at || null, assigned_to: v.assigned_to || null
                })
                toast.success('Follow-up scheduled')
                setCreateOpen(false)
                load()
              } catch (e) { toast.error(e.message) } finally { setBusy(false) }
            }}
          />
        </DialogContent>
      </Dialog>

      {completeTarget && (
        <CompleteDialog followUp={completeTarget} busy={busy} onClose={() => setCompleteTarget(null)}
          onDone={async () => { setCompleteTarget(null); load() }} />
      )}
    </Box>
  )
}

export function CompleteDialog({ followUp, busy, onClose, onDone }) {
  const toast = useToast()
  const [outcome, setOutcome] = useState('')
  const [scheduleNext, setScheduleNext] = useState(false)
  const [nextAt, setNextAt] = useState(toLocalInput(followUp.due_at))
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Complete: {followUp.title}</DialogTitle>
      <DialogContent>
        <TextField label="Outcome / Notes" fullWidth size="small" multiline minRows={2} value={outcome}
          onChange={(e) => setOutcome(e.target.value)} />
        <Checkbox checked={scheduleNext} onChange={(e) => setScheduleNext(e.target.checked)} sx={{ mt: 1 }} />
        <Typography variant="body2" component="span">Schedule next follow-up for this lead</Typography>
        {scheduleNext && (
          <TextField label="Next due" type="datetime-local" size="small" fullWidth sx={{ mt: 2 }} value={nextAt}
            onChange={(e) => setNextAt(e.target.value)} />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={async () => {
          setBusy(true)
          try {
            await api.post(`/api/follow-ups/${followUp.id}/complete`, {
              outcome: outcome || null,
              next_follow_up_at: scheduleNext && nextAt ? new Date(nextAt).toISOString() : null
            })
            toast.success('Follow-up completed')
            await onDone()
          } catch (e) { toast.error(e.message) } finally { setBusy(false) }
        }}>Complete</Button>
      </DialogActions>
    </Dialog>
  )
}
