import React, { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { toLocalInput } from '../utils/dates'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../theme'

const phoneSchema = z.string().trim().min(1, 'Phone is required')
  .refine((v) => /^\+?\d{10,15}$/.test(v.replace(/[()\s-]/g, '')), 'Enter a valid phone number (10-15 digits)')
const emailSchema = z.string().trim().email('Enter a valid email').or(z.literal(''))
const valueSchema = z.union([z.number().nonnegative('Must be a positive number'), z.literal('')])

export const leadFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  company_name: z.string().trim().optional(),
  phone: phoneSchema,
  email: emailSchema.optional(),
  city: z.string().trim().optional(),
  lead_source: z.string().trim().optional(),
  interested_product_or_service: z.string().trim().optional(),
  estimated_deal_value: valueSchema.optional(),
  priority: z.enum(['high', 'medium', 'low']),
  status: z.enum(['new', 'contacted', 'qualified', 'follow_up', 'proposal_sent', 'won', 'lost', 'on_hold']),
  assigned_to: z.string().optional(),
  general_remarks: z.string().trim().optional()
})

/**
 * Reusable lead create/edit form (React Hook Form + Zod).
 * props: initial (lead or {}), onSubmit(data), canAssign, assignedOptions [{id, full_name}],
 *        sources [string], busy, submitLabel
 */
export function LeadForm({ initial, onSubmit, canAssign = false, assignedOptions = [], sources = [], busy, submitLabel = 'Save' }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: initial.name || '',
      company_name: initial.company_name || '',
      phone: initial.phone || '',
      email: initial.email || '',
      city: initial.city || '',
      lead_source: initial.lead_source || '',
      interested_product_or_service: initial.interested_product_or_service || '',
      estimated_deal_value: initial.estimated_deal_value ?? '',
      priority: initial.priority || 'medium',
      status: initial.status || 'new',
      assigned_to: initial.assigned_to || '',
      general_remarks: initial.general_remarks || ''
    }
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField label="Full Name *" required fullWidth size="small" {...register('name')}
            error={Boolean(errors.name)} helperText={errors.name?.message} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField label="Company Name" fullWidth size="small" {...register('company_name')} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Phone Number *" required fullWidth size="small" {...register('phone')}
            error={Boolean(errors.phone)} helperText={errors.phone?.message} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Email" fullWidth size="small" {...register('email')}
            error={Boolean(errors.email)} helperText={errors.email?.message} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="City" fullWidth size="small" {...register('city')} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField select label="Lead Source" size="small" {...register('lead_source')}>
            {sources.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Interested Product/Service" fullWidth size="small" {...register('interested_product_or_service')} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Estimated Deal Value (₹)" type="number" fullWidth size="small" {...register('estimated_deal_value')}
            error={Boolean(errors.estimated_deal_value)} helperText={errors.estimated_deal_value?.message} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField select label="Priority" size="small" {...register('priority')}>
            {PRIORITY_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField select label="Status" size="small" {...register('status')}>
            {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        </Grid>
        {canAssign && (
          <Grid item xs={12} sm={4}>
            <TextField select label="Assigned To" size="small" {...register('assigned_to')}>
              <MenuItem value="">Unassigned</MenuItem>
              {assignedOptions.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
            </TextField>
          </Grid>
        )}
        <Grid item xs={12}>
          <TextField label="General Remarks" fullWidth size="small" multiline minRows={2} {...register('general_remarks')} />
        </Grid>
        <Grid item xs={12}>
          <Button type="submit" variant="contained" disabled={busy} startIcon={busy && <CircularProgress size={16} color="inherit" />}>
            {submitLabel}
          </Button>
        </Grid>
      </Grid>
    </form>
  )
}

const followUpSchema = z.object({
  lead_id: z.string().min(1, 'Select a lead'),
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim().optional(),
  follow_up_type: z.enum(['call', 'email', 'meeting', 'whatsapp', 'other']),
  due_at: z.string().min(1, 'Due date is required'),
  reminder_at: z.string().optional(),
  assigned_to: z.string().optional()
})

const FOLLOW_UP_TYPES = [
  { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'other', label: 'Other' }
]

/**
 * Reusable follow-up create/edit form.
 * props: initial, leads [{id, name, lead_code}], assignedOptions, canAssign, onSubmit, busy
 */
export function FollowUpForm({ initial, leads, assignedOptions = [], canAssign = false, onSubmit, busy }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      lead_id: initial.lead_id || '',
      title: initial.title || '',
      description: initial.description || '',
      follow_up_type: initial.follow_up_type || 'call',
      due_at: initial.due_at ? toLocalInput(initial.due_at) : '',
      reminder_at: initial.reminder_at ? toLocalInput(initial.reminder_at) : '',
      assigned_to: initial.assigned_to || ''
    }
  })

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v))} noValidate>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField select label="Lead *" required fullWidth size="small" {...register('lead_id')}
            error={Boolean(errors.lead_id)} helperText={errors.lead_id?.message}>
            {leads.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}{l.lead_code ? ` (${l.lead_code})` : ''}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12}>
          <TextField label="Title *" required fullWidth size="small" placeholder="e.g. Demo call on Tuesday"
            {...register('title')} error={Boolean(errors.title)} helperText={errors.title?.message} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField select label="Type" size="small" {...register('follow_up_type')}>
            {FOLLOW_UP_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Due Date & Time *" required type="datetime-local" fullWidth size="small"
            {...register('due_at')} error={Boolean(errors.due_at)} helperText={errors.due_at?.message} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Reminder (optional)" type="datetime-local" fullWidth size="small" {...register('reminder_at')} />
        </Grid>
        {canAssign && (
          <Grid item xs={12} sm={4}>
            <TextField select label="Responsible Employee" size="small" {...register('assigned_to')}>
              <MenuItem value="">Same as lead assignee</MenuItem>
              {assignedOptions.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
            </TextField>
          </Grid>
        )}
        <Grid item xs={12}>
          <TextField label="Notes" fullWidth size="small" multiline minRows={2} {...register('description')} />
        </Grid>
        <Grid item xs={12}>
          <Button type="submit" variant="contained" disabled={busy} startIcon={busy && <CircularProgress size={16} color="inherit" />}>
            {initial.id ? 'Update Follow-up' : 'Schedule Follow-up'}
          </Button>
        </Grid>
      </Grid>
    </form>
  )
}

const activitySchema = z.object({
  activity_type: z.enum(['call', 'email', 'meeting', 'whatsapp', 'note', 'other']),
  subject: z.string().trim().min(1, 'Subject is required'),
  remarks: z.string().trim().optional(),
  outcome: z.string().trim().optional()
})

export function LeadActivityForm({ initial, onSubmit, busy, title = 'Add Activity' }) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      activity_type: initial?.activity_type || 'call',
      subject: initial?.subject || '',
      remarks: initial?.remarks || '',
      outcome: initial?.outcome || ''
    }
  })
  useEffect(() => {
    if (initial) reset({
      activity_type: initial.activity_type || 'call',
      subject: initial.subject || '',
      remarks: initial.remarks || '',
      outcome: initial.outcome || ''
    })
  }, [initial, reset])

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <TextField select label="Activity Type" size="small" {...register('activity_type')}>
            {['call', 'email', 'meeting', 'whatsapp', 'note', 'other'].map((t) => (
              <MenuItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={8}>
          <TextField label="Subject *" required fullWidth size="small" {...register('subject')}
            error={Boolean(errors.subject)} helperText={errors.subject?.message} />
        </Grid>
        <Grid item xs={12} sm={8}>
          <TextField label="Remarks" fullWidth size="small" multiline minRows={2} {...register('remarks')} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Outcome (e.g. interested, busy, lost)" fullWidth size="small" {...register('outcome')} />
        </Grid>
        <Grid item xs={12}>
          <Button type="submit" variant="contained" disabled={busy} startIcon={busy && <CircularProgress size={16} color="inherit" />}>
            {title}
          </Button>
        </Grid>
      </Grid>
    </form>
  )
}

export function StatusChangeDialog({ open, lead, busy, onSubmit, onClose }) {
  const [status, setStatus] = React.useState(lead?.status || 'new')
  const [reason, setReason] = React.useState('')
  useEffect(() => {
    if (open) { setStatus(lead?.status || 'new'); setReason('') }
  }, [open, lead])

  const isLost = status === 'lost'
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change Status {lead?.lead_code ? `(${lead.lead_code})` : ''}</DialogTitle>
      <DialogContent>
        <TextField select label="New Status" value={status} onChange={(e) => setStatus(e.target.value)}
          fullWidth size="small" sx={{ mt: 1, mb: isLost ? 2 : 0 }}>
          {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        {isLost && (
          <TextField label="Reason for loss *" required fullWidth size="small" multiline minRows={2}
            value={reason} onChange={(e) => setReason(e.target.value)}
            helperText="Required — this powers the lost-reasons report" />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" disabled={busy || (isLost && !reason.trim())} onClick={() => onSubmit({ status, loss_reason: reason || null })}>
          Update Status
        </Button>
      </DialogActions>
    </Dialog>
  )
}
