import { z } from 'zod'

export const STATUSES = ['new', 'contacted', 'qualified', 'follow_up', 'proposal_sent', 'won', 'lost', 'on_hold']
export const PRIORITIES = ['high', 'medium', 'low']
export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'note', 'status_change', 'other']
export const FOLLOW_UP_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'other']
export const FOLLOW_UP_STATUSES = ['pending', 'completed', 'cancelled']

const phoneRe = /^\+?\d{10,15}$/
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const leadCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  company_name: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().min(1, 'Phone is required').transform((v) => v.replace(/[()\s-]/g, ''))
    .refine((v) => phoneRe.test(v), 'Phone must be 10-15 digits, optionally starting with +'),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(160).email('Enter a valid email address').nullable().optional()
  ),
  city: z.string().trim().max(100).optional().nullable(),
  lead_source: z.string().trim().max(100).optional().nullable(),
  interested_product_or_service: z.string().trim().max(200).optional().nullable(),
  estimated_deal_value: z.union([z.number().nonnegative('Deal value must be non-negative'),
    z.string().refine((v) => v === '' || !Number.isNaN(Number(v)), 'Deal value must be a number')])
    .optional().nullable(),
  priority: z.enum(PRIORITIES).default('medium'),
  status: z.enum(STATUSES).default('new'),
  assigned_to: z.string().uuid().optional().nullable(),
  general_remarks: z.string().trim().max(2000).optional().nullable()
})

export const leadUpdateSchema = leadCreateSchema
  .omit({ name: true, phone: true })
  .extend({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    phone: z.string().trim().min(1, 'Phone is required').transform((v) => v.replace(/[()\s-]/g, ''))
      .refine((v) => phoneRe.test(v), 'Phone must be 10-15 digits, optionally starting with +').optional(),
    loss_reason: z.string().trim().max(500).optional().nullable()
  })

export const activitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  subject: z.string().trim().max(200).optional().nullable(),
  remarks: z.string().trim().max(2000).optional().nullable(),
  outcome: z.string().trim().max(200).optional().nullable()
})

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')

export const followUpCreateSchema = z.object({
  lead_id: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  follow_up_type: z.enum(FOLLOW_UP_TYPES).default('call'),
  due_at: isoDate,
  reminder_at: isoDate.optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable()
})

export const followUpUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  follow_up_type: z.enum(FOLLOW_UP_TYPES).optional(),
  due_at: isoDate.optional(),
  reminder_at: isoDate.optional().nullable(),
  status: z.enum(FOLLOW_UP_STATUSES).optional()
})

export const followUpCompleteSchema = z.object({
  outcome: z.string().trim().max(1000).optional().nullable(),
  next_follow_up_at: isoDate.optional().nullable(),
  next_follow_up_type: z.enum(FOLLOW_UP_TYPES).optional()
})

export const userCreateSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Enter a valid email').max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  role: z.enum(['admin', 'user']).default('user')
})

export const userUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['admin', 'user']).optional(),
  is_active: z.boolean().optional()
})

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, 'Password is required')
})

export const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(4).max(12),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100)
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email()
})

export const bulkAssignSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1, 'Select at least one lead').max(500),
  assigned_to: z.string().uuid().nullable()
})

export const importConfirmSchema = z.object({
  payload: z.string().min(1),
  signature: z.string().min(16),
  include_duplicates: z.boolean().default(false)
})

export const settingsSchema = z.object({
  lead_sources: z.array(z.string().trim().min(1).max(60)).min(1).max(30)
})
