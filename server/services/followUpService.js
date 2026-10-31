import { ApiError } from '../lib/utils.js'

/** Follow-up business rules (ownership, default assignee, next-follow-up chaining). */
export function buildFollowUpService(store) {
  const scopeUserId = (user) => (user.role === 'admin' ? null : user.id)

  async function assertFulfilledAccess(fu, user) {
    if (!fu) throw new ApiError(404, 'Follow-up not found')
    if (user.role !== 'admin' && fu.assigned_to !== user.id) throw new ApiError(404, 'Follow-up not found')
    return fu
  }

  async function resolveAssignee(lead, requested, user) {
    if (requested) {
      if (user.role !== 'admin') throw new ApiError(403, 'Only administrators can pick the responsible employee')
      const p = await store.profiles.getProfile(requested)
      if (!p || !p.is_active) throw new ApiError(400, 'Assigned user does not exist or is inactive')
      return requested
    }
    return lead.assigned_to || user.id
  }

  async function create(data, user) {
    const lead = await store.leads.getLead(data.lead_id)
    if (!lead) throw new ApiError(404, 'Lead not found')
    if (user.role !== 'admin' && lead.assigned_to && lead.assigned_to !== user.id) {
      throw new ApiError(404, 'Lead not found')
    }
    const assignedTo = await resolveAssignee(lead, data.assigned_to, user)
    const fu = await store.followUps.create({
      lead_id: lead.id,
      assigned_to: assignedTo,
      created_by: user.id,
      title: data.title,
      description: data.description || null,
      follow_up_type: data.follow_up_type || 'call',
      due_at: new Date(data.due_at).toISOString(),
      reminder_at: data.reminder_at ? new Date(data.reminder_at).toISOString() : null
    })
    if (assignedTo !== user.id) {
      await store.notifications.create({
        user_id: assignedTo,
        lead_id: lead.id,
        follow_up_id: fu.id,
        title: 'Follow-up scheduled',
        message: `"${fu.title}" for ${lead.name} was scheduled for you.`,
        notification_type: 'follow_up_created'
      })
    }
    await store.leads.refreshNextFollowUp(lead.id)
    return fu
  }

  async function update(id, data, user) {
    const fu = await store.followUps.get(id)
    await assertFulfilledAccess(fu, user)
    const fields = {}
    for (const k of ['title', 'description', 'follow_up_type']) if (data[k] !== undefined) fields[k] = data[k]
    if (data.due_at) fields.due_at = new Date(data.due_at).toISOString()
    if (data.reminder_at !== undefined) fields.reminder_at = data.reminder_at ? new Date(data.reminder_at).toISOString() : null
    if (data.status === 'cancelled') {
      fields.status = 'cancelled'
      fields.outcome = data.outcome || null
    }
    const updated = await store.followUps.update(id, fields)
    if (fields.due_at || fields.status) await store.leads.refreshNextFollowUp(fu.lead_id)
    return updated
  }

  async function complete(id, data, user) {
    const fu = await store.followUps.get(id)
    await assertFulfilledAccess(fu, user)
    if (fu.status === 'completed') throw new ApiError(409, 'Follow-up is already completed')
    const updated = await store.followUps.complete(id, {
      outcome: data.outcome || null,
      completedAt: new Date().toISOString()
    })
    if (data.next_follow_up_at) {
      await store.followUps.create({
        lead_id: fu.lead_id,
        assigned_to: fu.assigned_to,
        created_by: user.id,
        title: `Follow-up: ${fu.title}`,
        description: `Scheduled after completing "${fu.title}"`,
        follow_up_type: data.next_follow_up_type || fu.follow_up_type,
        due_at: new Date(data.next_follow_up_at).toISOString(),
        reminder_at: null
      })
    }
    await store.leads.refreshNextFollowUp(fu.lead_id)
    await store.activities.create({
      lead_id: fu.lead_id,
      user_id: user.id,
      activity_type: fu.follow_up_type === 'call' ? 'call' : fu.follow_up_type === 'email' ? 'email'
        : fu.follow_up_type === 'meeting' ? 'meeting' : fu.follow_up_type === 'whatsapp' ? 'whatsapp' : 'other',
      subject: `Follow-up completed: ${fu.title}`,
      remarks: data.outcome || null,
      outcome: 'completed'
    })
    return updated
  }

  return { create, update, complete, assertFulfilledAccess, scopeUserId }
}
