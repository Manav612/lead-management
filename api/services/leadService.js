import { ApiError } from '../lib/utils.js'
import { STATUSES } from '../lib/validators.js'

/**
 * Lead business rules. All functions receive an authenticated `user`
 * ({id, role}) — ownership checks happen here, not only in the UI.
 */
export function buildLeadService(store) {
  const scopeUserId = (user) => (user.role === 'admin' ? null : user.id)

  async function assertLeadAccess(lead, user) {
    if (!lead) throw new ApiError(404, 'Lead not found')
    if (user.role !== 'admin' && lead.assigned_to !== user.id) {
      throw new ApiError(404, 'Lead not found')
    }
    return lead
  }

  async function createLead(data, user) {
    let payload = { ...data }
    if (user.role !== 'admin') {
      if (payload.assigned_to && payload.assigned_to !== user.id) {
        throw new ApiError(403, 'You can only create leads for yourself')
      }
      payload.assigned_to = user.id
    }
    if (payload.assigned_to) {
      const assignee = await store.profiles.getProfile(payload.assigned_to)
      if (!assignee || !assignee.is_active) throw new ApiError(400, 'Assigned user does not exist or is inactive')
    }
    const lead = await store.leads.createLead(payload, user.id)
    if (lead.assigned_to && lead.assigned_to !== user.id) {
      await store.notifications.create({
        user_id: lead.assigned_to,
        lead_id: lead.id,
        title: 'Lead assigned',
        message: `Lead "${lead.name}${lead.company_name ? ' - ' + lead.company_name : ''}" was assigned to you.`,
        notification_type: 'assigned'
      })
    }
    return lead
  }

  async function updateLead(id, data, user) {
    const lead = await store.leads.getLead(id)
    await assertLeadAccess(lead, user)

    const fields = {}
    const editable = ['name', 'company_name', 'phone', 'email', 'city', 'lead_source',
      'interested_product_or_service', 'estimated_deal_value', 'priority', 'status', 'general_remarks']
    for (const k of editable) if (data[k] !== undefined) fields[k] = data[k]

    if (data.assigned_to !== undefined) {
      if (user.role !== 'admin') throw new ApiError(403, 'Only administrators can change lead assignment')
      const newAssignee = data.assigned_to
      if (newAssignee) {
        const assignee = await store.profiles.getProfile(newAssignee)
        if (!assignee || !assignee.is_active) throw new ApiError(400, 'Assigned user does not exist or is inactive')
      }
      fields.assigned_to = newAssignee
      if (lead.assigned_to !== newAssignee && newAssignee) {
        await store.notifications.create({
          user_id: newAssignee,
          lead_id: lead.id,
          title: 'Lead assigned',
          message: `Lead "${lead.name}${lead.company_name ? ' - ' + lead.company_name : ''}" was assigned to you.`,
          notification_type: 'assigned'
        })
      }
    }

    // status change handling
    let lossReason = data.loss_reason || null
    if (fields.status && fields.status !== lead.status) {
      if (fields.status === 'lost' && !lossReason) {
        throw new ApiError(400, 'A loss reason is required when marking a lead as Lost')
      }
      if (!STATUSES.includes(fields.status)) throw new ApiError(400, 'Invalid status')
      if (fields.status === 'lost' && lossReason) fields.loss_reason = lossReason
      await store.statusHistory.add({
        lead_id: lead.id,
        old_status: lead.status,
        new_status: fields.status,
        changed_by: user.id,
        reason: fields.status === 'lost' ? lossReason : null
      })
      await store.activities.create({
        lead_id: lead.id,
        user_id: user.id,
        activity_type: 'status_change',
        subject: `Status changed: ${label(lead.status)} → ${label(fields.status)}`,
        remarks: fields.status === 'lost' ? `Reason: ${lossReason}` : null,
        outcome: null
      })
    }

    const updated = await store.leads.updateLead(id, fields)
    return updated
  }

  async function bulkAssign(leadIds, assignedTo, user) {
    if (assignedTo) {
      const assignee = await store.profiles.getProfile(assignedTo)
      if (!assignee || !assignee.is_active) throw new ApiError(400, 'Assigned user does not exist or is inactive')
    }
    const updated = await store.leads.setAssigned(leadIds, assignedTo)
    if (assignedTo) {
      await store.notifications.create({
        user_id: assignedTo,
        lead_id: null,
        title: 'Leads assigned',
        message: `${updated} lead(s) were assigned to you.`,
        notification_type: 'assigned'
      })
    }
    return updated
  }

  async function addActivity(leadId, data, user) {
    const lead = await store.leads.getLead(leadId)
    await assertLeadAccess(lead, user)
    const activity = await store.activities.create({
      lead_id: leadId,
      user_id: user.id,
      activity_type: data.activity_type,
      subject: data.subject || null,
      remarks: data.remarks || null,
      outcome: data.outcome || null
    })
    return activity
  }

  const label = (s) => (STATUSES.includes(s) ? s.replace('_', ' ') : s)

  return { createLead, updateLead, bulkAssign, addActivity, assertLeadAccess, scopeUserId }
}
