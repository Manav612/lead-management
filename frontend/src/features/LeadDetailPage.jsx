import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Timeline from '@mui/lab/Timeline'
import TimelineItem from '@mui/lab/TimelineItem'
import TimelineSeparator from '@mui/lab/TimelineSeparator'
import TimelineDot from '@mui/lab/TimelineDot'
import TimelineContent from '@mui/lab/TimelineContent'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import PhoneIcon from '@mui/icons-material/Phone'
import EmailIcon from '@mui/icons-material/Email'
import BusinessIcon from '@mui/icons-material/Business'
import PlaceIcon from '@mui/icons-material/Place'
import AddCommentIcon from '@mui/icons-material/AddComment'
import CallIcon from '@mui/icons-material/Call'
import EventIcon from '@mui/icons-material/Event'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'

function DialogCloseTitle({ title, onClose }) {
  return (
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <span>{title}</span>
      <IconButton size="small" aria-label="Close" onClick={onClose} sx={{ color: 'text.secondary' }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
  )
}
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PageHeader, StatusChip, PriorityChip, LoadingBlock, ErrorBlock, EmptyState, StatusChip as SC } from '../components/ui'
import { LeadForm, FollowUpForm, LeadActivityForm, StatusChangeDialog } from '../components/forms'
import { fmtDateTime, fmtDate, relative, isOverdue, toLocalInput } from '../utils/dates'
import { formatCurrency } from '../utils/format'
import { STATUS_OPTIONS } from '../theme'

const ACTIVITY_ICONS = {
  call: <CallIcon fontSize="small" />,
  email: <EmailIcon fontSize="small" />,
  meeting: <EventIcon fontSize="small" />,
  whatsapp: <EmailIcon fontSize="small" />,
  note: <AddCommentIcon fontSize="small" />,
  status_change: <EditIcon fontSize="small" />,
  other: <AddCommentIcon fontSize="small" />
}

function InfoRow({ icon, label, value }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1, alignItems: 'baseline' }}>
      {icon}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value || '—'}</Typography>
      </Box>
    </Box>
  )
}

export default function LeadDetailPage({ isAdmin = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(0)

  const [activities, setActivities] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [history, setHistory] = useState([])
  const [assignedUsers, setAssignedUsers] = useState([])

  const [statusDialog, setStatusDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [activityDialog, setActivityDialog] = useState(null) // 'note' | 'call'
  const [fuDialog, setFuDialog] = useState(false)
  const [completeDialog, setCompleteDialog] = useState(null)
  const [reschedule, setReschedule] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [l, a, fu, h] = await Promise.all([
        api.get(`/api/leads/${id}`),
        api.get(`/api/leads/${id}/activities`),
        api.get(`/api/follow-ups?lead_id=${id}&pageSize=100`),
        api.get(`/api/leads/${id}/status-history`)
      ])
      setLead(l.lead)
      setActivities(a.rows)
      setFollowUps(fu.rows)
      setHistory(h.rows)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isAdmin) {
      api.get('/api/users').then((d) => setAssignedUsers(d.rows)).catch(() => {})
    }
  }, [isAdmin])

  const guard = (fn) => async (...args) => {
    setBusy(true)
    try { await fn(...args); await load(true) } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  if (loading) return <LoadingBlock rows={8} />
  if (error) return <ErrorBlock message={error} onRetry={load} />
  if (!lead) return <EmptyState title="Lead not found" action={<Button component={Link} to={isAdmin ? '/admin/leads' : '/app/leads'}>Back to leads</Button>} />

  const backTo = isAdmin ? '/admin/leads' : '/app/leads'

  return (
    <Box>
      <PageHeader
        title={`${lead.name}${lead.company_name ? ` · ${lead.company_name}` : ''}`}
        subtitle={
          <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)}>All leads</Button>
            <span>{lead.lead_code}</span>
            <SC status={lead.status} size="small" />
            <PriorityChip priority={lead.priority} />
          </Box>
        }
        actions={
          <>
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditDialog(true)}>Edit Lead</Button>
            <Button variant="contained" startIcon={<EventIcon />} onClick={() => setFuDialog(true)}>Schedule Follow-up</Button>
          </>
        }
      />

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Contact</Typography>
              <InfoRow icon={<BusinessIcon fontSize="small" color="action" />} label="Company" value={lead.company_name} />
              <InfoRow icon={<PhoneIcon fontSize="small" color="action" />} label="Phone"
                value={<a href={`tel:${lead.phone}`}>{lead.phone}</a>} />
              <InfoRow icon={<EmailIcon fontSize="small" color="action" />} label="Email"
                value={lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : '—'} />
              <InfoRow icon={<PlaceIcon fontSize="small" color="action" />} label="City" value={lead.city} />
              <InfoRow icon={<EventIcon fontSize="small" color="action" />} label="Interested Product/Service"
                value={lead.interested_product_or_service} />
              <Divider sx={{ my: 1 }} />
              <InfoRow icon={<BusinessIcon fontSize="small" color="action" />} label="Estimated Deal Value"
                value={formatCurrency(lead.estimated_deal_value)} />
              <InfoRow icon={<EventIcon fontSize="small" color="action" />} label="Next Follow-up"
                value={lead.next_follow_up_at
                  ? <span style={{ color: isOverdue(lead.next_follow_up_at) ? '#DC2626' : 'inherit', fontWeight: 600 }}>
                      {fmtDateTime(lead.next_follow_up_at)}
                    </span>
                  : '—'} />
              <InfoRow icon={<PlaceIcon fontSize="small" color="action" />} label="Lead Source" value={lead.lead_source} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                Created {fmtDate(lead.created_at)} by {lead.created_by_name || '—'} · Updated {fmtDateTime(lead.updated_at)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Quick Actions</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button variant="outlined" startIcon={<AddCommentIcon />} onClick={() => setActivityDialog('note')}>Add Remark</Button>
                <Button variant="outlined" startIcon={<CallIcon />} onClick={() => setActivityDialog('call')}>Record Call</Button>
                <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setStatusDialog(true)}>Change Status</Button>
                <Button variant="outlined" startIcon={<EventIcon />} onClick={() => setFuDialog(true)}>Schedule Follow-up</Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid #E5E9F0' }}>
              <Tab label="Activities" />
              <Tab label={`Follow-ups (${followUps.length})`} />
              <Tab label="Status History" />
            </Tabs>

            <Box sx={{ p: 2, minHeight: 200 }}>
              {tab === 0 && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                    <Button size="small" variant="outlined" startIcon={<AddCommentIcon />} onClick={() => setActivityDialog('note')}>Add Activity</Button>
                  </Box>
                  {activities.length === 0
                    ? <EmptyState title="No activities yet" hint="Record calls, emails and meetings to build the lead history." />
                    : (
                      <Timeline sx={{ pl: 0 }}>
                        {[...activities].reverse().map((a) => (
                          <TimelineItem key={a.id}>
                            <TimelineSeparator>
                              <TimelineDot color="primary" variant="outlined">{ACTIVITY_ICONS[a.activity_type] || ACTIVITY_ICONS.other}</TimelineDot>
                            </TimelineSeparator>
                            <TimelineContent sx={{ pb: 2 }}>
                              <Typography variant="body2" fontWeight={600}>{a.subject || a.activity_type}</Typography>
                              {a.remarks && <Typography variant="body2" color="text.secondary">{a.remarks}</Typography>}
                              <Typography variant="caption" color="text.secondary">
                                {a.activity_type.replace('_', ' ')} · {a.user_name || '—'} · {fmtDateTime(a.created_at)}
                                {a.outcome ? ` · Outcome: ${a.outcome}` : ''}
                              </Typography>
                            </TimelineContent>
                          </TimelineItem>
                        ))}
                      </Timeline>
                    )}
                </Box>
              )}

              {tab === 1 && (
                <Box>
                  {followUps.length === 0
                    ? <EmptyState title="No follow-ups scheduled"
                        action={<Button variant="contained" size="small" onClick={() => setFuDialog(true)}>Schedule Follow-up</Button>} />
                    : followUps.map((f) => (
                      <Box key={f.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 1.5, borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
                        <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                          <Typography variant="body2" fontWeight={600}>{f.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {f.follow_up_type} · due {fmtDateTime(f.due_at)} ({relative(f.due_at)})
                            {f.status === 'completed' && ` · completed ${fmtDate(f.completed_at)}`}
                            {f.status === 'cancelled' && ' · cancelled'}
                          </Typography>
                          {f.outcome && <Typography variant="caption" color="text.secondary">Outcome: {f.outcome}</Typography>}
                        </Box>
                        <StatusChip status={f.status === 'pending' ? 'follow_up' : f.status === 'completed' ? 'won' : 'on_hold'} />
                        {f.status === 'pending' && (
                          <>
                            <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
                              onClick={() => setCompleteDialog(f)}>Complete</Button>
                            <Button size="small" variant="outlined" onClick={() => setReschedule(f)}>Reschedule</Button>
                            <IconButton size="small" aria-label="Cancel follow-up"
                              onClick={guard(() => api.patch(`/api/follow-ups/${f.id}`, { status: 'cancelled' }).then(() => toast.success('Follow-up cancelled')))}>
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </Box>
                    ))}
                </Box>
              )}

              {tab === 2 && (
                history.length === 0
                  ? <EmptyState title="No status changes yet" />
                  : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>From</TableCell><TableCell>To</TableCell><TableCell>By</TableCell>
                          <TableCell>Reason</TableCell><TableCell>When</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>{h.old_status ? h.old_status.replace('_', ' ') : '—'}</TableCell>
                            <TableCell><StatusChip status={h.new_status} /></TableCell>
                            <TableCell>{h.changed_by_name || '—'}</TableCell>
                            <TableCell>{h.reason || '—'}</TableCell>
                            <TableCell>{fmtDateTime(h.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* dialogs */}
      <StatusChangeDialog open={statusDialog} lead={lead} busy={busy} onClose={() => setStatusDialog(false)}
        onSubmit={guard((v) => api.patch(`/api/leads/${lead.id}`, v).then(() => { toast.success('Status updated'); setStatusDialog(false) }))} />

      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle title="Edit Lead" onClose={() => setEditDialog(false)} />
        <DialogContent>
          <LeadForm initial={lead} busy={busy} submitLabel="Save Changes" canAssign={isAdmin}
            assignedOptions={assignedUsers} sources={['Website', 'Referral', 'Cold Call', 'Social Media', 'Advertisement', 'Event']}
            onSubmit={guard((v) => api.patch(`/api/leads/${lead.id}`, v).then(() => { toast.success('Lead updated'); setEditDialog(false) }))} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activityDialog)} onClose={() => setActivityDialog(null)} maxWidth="md" fullWidth>
        <DialogCloseTitle title={activityDialog === 'call' ? 'Record Call' : 'Add Remark'} onClose={() => setActivityDialog(null)} />
        <DialogContent>
          <LeadActivityForm
            title={activityDialog === 'call' ? 'Save Call' : 'Save Remark'}
            initial={activityDialog === 'call' ? { activity_type: 'call' } : { activity_type: 'note' }}
            busy={busy}
            onSubmit={guard((v) => api.post(`/api/leads/${lead.id}/activities`, v).then(() => { toast.success('Activity recorded'); setActivityDialog(null) }))}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={fuDialog} onClose={() => setFuDialog(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle title="Schedule Follow-up" onClose={() => setFuDialog(false)} />
        <DialogContent>
          <FollowUpForm
            leads={[lead]}
            initial={{ lead_id: lead.id }}
            busy={busy}
            canAssign={isAdmin}
            assignedOptions={assignedUsers}
            onSubmit={guard((v) => api.post('/api/follow-ups', {
              lead_id: v.lead_id, title: v.title, description: v.description,
              follow_up_type: v.follow_up_type,
              due_at: v.due_at, reminder_at: v.reminder_at || null,
              assigned_to: v.assigned_to || null
            }).then(() => { toast.success('Follow-up scheduled'); setFuDialog(false) }))}
          />
        </DialogContent>
      </Dialog>

      {completeDialog && (
        <CompleteFollowUpDialog followUp={completeDialog} lead={lead} busy={busy}
          onClose={() => setCompleteDialog(null)}
          onDone={async (v) => { await load(); setCompleteDialog(null); toast.success('Follow-up completed') }}
          save={async (v) => {
            await api.post(`/api/follow-ups/${completeDialog.id}/complete`, v)
            if (v.next_follow_up_at) {
              await api.post('/api/follow-ups', {
                lead_id: lead.id, title: `Follow-up: ${completeDialog.title}`,
                follow_up_type: v.next_follow_up_type || completeDialog.follow_up_type,
                due_at: v.next_follow_up_at, assigned_to: null
              })
            }
          }} />
      )}

      {reschedule && (
        <RescheduleDialog followUp={reschedule} busy={busy}
          onClose={() => setReschedule(null)}
          onDone={async () => { await load(); setReschedule(null); toast.success('Follow-up rescheduled') }} />
      )}
    </Box>
  )
}

function CompleteFollowUpDialog({ followUp, busy, onClose, save, onDone }) {
  const toast = useToast()
  const [outcome, setOutcome] = useState('')
  const [scheduleNext, setScheduleNext] = useState(false)
  const [nextAt, setNextAt] = useState(toLocalInput(followUp.due_at))
  const [nextType, setNextType] = useState(followUp.follow_up_type)
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseTitle title="Complete Follow-up" onClose={onClose} />
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>{followUp.title}</Typography>
        <TextField label="Outcome / Notes" fullWidth size="small" multiline minRows={2} value={outcome}
          onChange={(e) => setOutcome(e.target.value)} />
        <Box sx={{ mt: 2 }}>
          <TextField select label="Schedule Next" value={scheduleNext ? 'yes' : 'no'} fullWidth size="small"
            onChange={(e) => setScheduleNext(e.target.value === 'yes')}>
            <MenuItem value="no">No</MenuItem>
            <MenuItem value="yes">Yes, schedule next follow-up</MenuItem>
          </TextField>
          {scheduleNext && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <TextField label="Next due" type="datetime-local" size="small" value={nextAt} fullWidth
                onChange={(e) => setNextAt(e.target.value)} />
              <TextField select label="Type" size="small" value={nextType} onChange={(e) => setNextType(e.target.value)}>
                {['call', 'email', 'meeting', 'whatsapp', 'other'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={async () => {
          try {
            await save({
              outcome: outcome || null,
              next_follow_up_at: scheduleNext && nextAt ? new Date(nextAt).toISOString() : null,
              next_follow_up_type: scheduleNext ? nextType : undefined
            })
            await onDone()
          } catch (e) { toast.error(e.message) }
        }}>Mark Completed</Button>
      </DialogActions>
    </Dialog>
  )
}

function RescheduleDialog({ followUp, busy, onClose, onDone }) {
  const toast = useToast()
  const [dueAt, setDueAt] = useState(toLocalInput(followUp.due_at))
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseTitle title="Reschedule Follow-up" onClose={onClose} />
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>{followUp.title}</Typography>
        <TextField label="New due date & time" type="datetime-local" size="small" fullWidth value={dueAt}
          onChange={(e) => setDueAt(e.target.value)} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={async () => {
          try {
            await api.patch(`/api/follow-ups/${followUp.id}`, { due_at: new Date(dueAt).toISOString() })
            await onDone()
          } catch (e) { toast.error(e.message) }
        }}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
