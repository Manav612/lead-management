-- ============================================================
-- LeadFlow CRM — OPTIONAL seed data for a DEV Supabase project
-- Run only against a development project (NEVER production).
-- Requires: 0001_init.sql already applied, and at least one
-- auth user with a profile (create the first admin with
-- `npm run first-admin` or via the Supabase dashboard).
-- Inserts sample leads/activities/follow-ups linked to your
-- existing profiles. Safe to re-run? No — it duplicates data.
-- ============================================================

do $$
declare
  v_admin uuid;
  v_user1 uuid;
  v_user2 uuid;
  v_lead1 uuid; v_lead2 uuid; v_lead3 uuid; v_lead4 uuid; v_lead5 uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and is_active limit 1;
  if v_admin is null then
    raise notice 'No active admin profile found - skipping seed (run npm run first-admin first).';
    return;
  end if;
  select id into v_user1 from public.profiles where role = 'user' and is_active limit 1;
  select id into v_user2 from public.profiles where role = 'user' and is_active offset 1 limit 1;
  if v_user1 is null then
    raise notice 'No regular user profiles found - creating samples assigned to the admin only.';
    v_user1 := v_admin;
    v_user2 := v_admin;
  end if;

  insert into public.leads (lead_code, name, company_name, phone, email, city, lead_source,
    interested_product_or_service, estimated_deal_value, priority, status, assigned_to, created_by)
  values (public.next_lead_code(), 'Rahul Sharma', 'Sharma Traders', '+91 98200 11111', 'rahul@sharmatraders.in', 'Mumbai',
    'Website', 'Annual plan', 150000, 'high', 'qualified', v_user1, v_admin)
  returning id into v_lead1;

  insert into public.leads (lead_code, name, company_name, phone, email, city, lead_source,
    interested_product_or_service, estimated_deal_value, priority, status, assigned_to, created_by)
  values (public.next_lead_code(), 'Anita Verma', 'Verma Textiles', '+91 98111 22222', 'anita@vermatextiles.com', 'Indore',
    'Referral', 'Team plan', 320000, 'medium', 'proposal_sent', v_user2, v_admin)
  returning id into v_lead2;

  insert into public.leads (lead_code, name, company_name, phone, email, city, lead_source,
    interested_product_or_service, estimated_deal_value, priority, status, assigned_to, created_by)
  values (public.next_lead_code(), 'Kiran Patel', 'Patel Logistics', '+91 99090 33333', null, 'Ahmedabad',
    'Cold Call', 'Annual plan', 90000, 'low', 'new', v_user1, v_admin)
  returning id into v_lead3;

  insert into public.leads (lead_code, name, company_name, phone, email, city, lead_source,
    interested_product_or_service, estimated_deal_value, priority, status, assigned_to, created_by)
  values (public.next_lead_code(), 'Meera Iyer', 'Iyer Consulting', '+91 98450 44444', 'meera@iyercons.com', 'Chennai',
    'Social Media', 'Team plan', 210000, 'high', 'won', v_user2, v_admin)
  returning id into v_lead4;

  insert into public.leads (lead_code, name, company_name, phone, email, city, lead_source,
    interested_product_or_service, estimated_deal_value, priority, status, assigned_to, created_by)
  values (public.next_lead_code(), 'Suresh Nair', 'Nair Motors', '+91 97400 55555', 'suresh@nairmotors.in', 'Kochi',
    'Advertisement', 'Starter plan', 45000, 'medium', 'lost', v_user1, v_admin)
  returning id into v_lead5;

  insert into public.lead_status_history (lead_id, old_status, new_status, changed_by, reason)
  values (v_lead5, 'follow_up', 'lost', v_user1, 'Budget not approved this quarter');

  insert into public.activities (lead_id, user_id, activity_type, subject, remarks, outcome)
  values
    (v_lead1, v_user1, 'call', 'Intro call', 'Discussed requirements, wants demo next week', 'interested'),
    (v_lead1, v_user1, 'email', 'Sent proposal', 'Proposal v1 shared', null),
    (v_lead4, v_user2, 'meeting', 'Demo meeting', 'On-site demo with the team', 'positive'),
    (v_lead5, v_user1, 'call', 'Follow-up call', 'Budget frozen for this quarter', 'lost');

  insert into public.follow_ups (lead_id, assigned_to, created_by, title, description,
    follow_up_type, due_at, reminder_at, status, outcome, completed_at)
  values
    (v_lead1, v_user1, v_user1, 'Demo call with Rahul', 'Walk through the annual plan pricing', 'call',
     now() + interval '1 day', now() + interval '20 hour', 'pending', null, null),
    (v_lead2, v_user2, v_user2, 'Chase proposal', 'Follow up on the proposal sent last week', 'email',
     now() - interval '1 day', null, 'pending', null, null),
    (v_lead3, v_user1, v_user1, 'First contact', 'Intro call about our services', 'call',
     now() + interval '3 days', now() + interval '2 days', 'pending', null, null),
    (v_lead4, v_user2, v_user2, 'Onboarding kickoff', 'Kick off the implementation', 'meeting',
     now() - interval '2 days', null, 'completed', 'Meeting held, plan agreed', now() - interval '1 day');
end $$;
