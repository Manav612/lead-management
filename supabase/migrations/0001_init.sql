-- ============================================================
-- LeadFlow CRM — initial migration (Supabase PostgreSQL)
-- Run in: Supabase Dashboard -> SQL Editor (or `supabase db push`)
-- Safe to run once on a fresh project. It does NOT drop data.
-- ============================================================

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user') = 'admin';
$$;

-- human-readable lead codes: LD-<year>-<6 digit sequence>
create sequence if not exists public.lead_code_seq start 1;

create or replace function public.next_lead_code()
returns text language plpgsql security definer as $$
declare
  y int := extract(year from now());
  n bigint;
begin
  n := nextval('public.lead_code_seq');
  return 'LD-' || y || '-' || lpad(n::text, 6, '0');
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null,
  role        text not null default 'user' check (role in ('admin','user')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'user', true)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- leads ----------
create table if not exists public.leads (
  id                            uuid primary key default gen_random_uuid(),
  lead_code                     text not null unique,
  name                          text not null,
  company_name                  text,
  phone                         text not null,
  email                         text,
  city                          text,
  lead_source                   text,
  interested_product_or_service text,
  estimated_deal_value          numeric(14,2) check (estimated_deal_value >= 0),
  priority                      text not null default 'medium' check (priority in ('high','medium','low')),
  status                        text not null default 'new'
                                check (status in ('new','contacted','qualified','follow_up','proposal_sent','won','lost','on_hold')),
  assigned_to                   uuid references public.profiles(id) on delete set null,
  general_remarks               text,
  import_batch_id               uuid,
  created_by                    uuid references public.profiles(id) on delete set null,
  next_follow_up_at             timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
create index if not exists leads_status_idx      on public.leads (status);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists leads_phone_idx       on public.leads (phone);
create index if not exists leads_email_idx       on public.leads (lower(email));
create index if not exists leads_source_idx      on public.leads (lead_source);
create index if not exists leads_created_at_idx  on public.leads (created_at);
create index if not exists leads_next_fu_idx     on public.leads (next_follow_up_at);
create index if not exists leads_import_batch_idx on public.leads (import_batch_id);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------- activities ----------
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  activity_type text not null check (activity_type in ('call','email','meeting','whatsapp','note','status_change','other')),
  subject       text,
  remarks       text,
  outcome       text,
  created_at    timestamptz not null default now()
);
create index if not exists activities_lead_idx on public.activities (lead_id, created_at);
create index if not exists activities_user_idx on public.activities (user_id);

-- ---------- follow_ups ----------
create table if not exists public.follow_ups (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.leads(id) on delete cascade,
  assigned_to      uuid references public.profiles(id) on delete cascade,
  created_by       uuid references public.profiles(id) on delete set null,
  title            text not null,
  description      text,
  follow_up_type   text not null default 'call' check (follow_up_type in ('call','email','meeting','whatsapp','other')),
  due_at           timestamptz not null,
  reminder_at      timestamptz,
  status           text not null default 'pending' check (status in ('pending','completed','cancelled')),
  outcome          text,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists follow_ups_assigned_idx  on public.follow_ups (assigned_to, status);
create index if not exists follow_ups_due_idx       on public.follow_ups (due_at);
create index if not exists follow_ups_lead_idx      on public.follow_ups (lead_id);
create index if not exists follow_ups_status_idx    on public.follow_ups (status);

create trigger follow_ups_set_updated_at
  before update on public.follow_ups
  for each row execute function public.set_updated_at();

-- ---------- notifications ----------
create table if not exists public.notifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  lead_id           uuid references public.leads(id) on delete cascade,
  follow_up_id      uuid references public.follow_ups(id) on delete cascade,
  title             text not null,
  message           text,
  notification_type text not null default 'info',
  is_read           boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, is_read) where is_read = false;
-- one reminder notification per follow-up + event type (idempotent generation)
create unique index if not exists notifications_fu_type_uq
  on public.notifications (follow_up_id, notification_type);

-- ---------- lead_status_history ----------
create table if not exists public.lead_status_history (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  old_status   text,
  new_status   text not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists lsh_lead_idx on public.lead_status_history (lead_id, created_at desc);

-- ---------- import_batches ----------
create table if not exists public.import_batches (
  id                 uuid primary key default gen_random_uuid(),
  original_filename  text not null,
  uploaded_by        uuid references public.profiles(id) on delete set null,
  total_rows         integer not null default 0,
  valid_rows         integer not null default 0,
  invalid_rows       integer not null default 0,
  duplicate_rows     integer not null default 0,
  skipped_duplicates integer not null default 0,
  imported_rows      integer not null default 0,
  import_status      text not null default 'processing' check (import_status in ('processing','completed','failed')),
  signature_hash     text,
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create index if not exists import_batches_created_idx on public.import_batches (created_at desc);
create unique index if not exists import_batches_sig_uq on public.import_batches (signature_hash);

-- ---------- import_errors ----------
create table if not exists public.import_errors (
  id              uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number      integer not null,
  raw_row_data    jsonb not null default '{}'::jsonb,
  error_messages  jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists import_errors_batch_idx on public.import_errors (import_batch_id);

-- ---------- app_settings ----------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value)
values ('lead_sources', '["Website","Referral","Cold Call","Social Media","Advertisement","Event"]'::jsonb)
on conflict (key) do nothing;

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ============================================================
-- Idempotent generation of due/overdue/reminder notifications.
-- Safe to call on every notification poll; inserts at most one
-- row per (follow_up, event type).
-- ============================================================
create or replace function public.ensure_due_notifications(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into public.notifications (user_id, lead_id, follow_up_id, title, message, notification_type)
  select f.assigned_to, f.lead_id, f.id,
         case when f.due_at < now() then 'Overdue follow-up' else 'Follow-up due today' end,
         case when f.due_at < now()
              then 'Follow-up "' || f.title || '" for ' || l.name || ' is overdue.'
              else 'Follow-up "' || f.title || '" for ' || l.name || ' is due today.'
         end,
         case when f.due_at < now() then 'follow_up_overdue' else 'follow_up_due' end
  from public.follow_ups f
  join public.leads l on l.id = f.lead_id
  where f.assigned_to = p_user_id
    and f.status = 'pending'
    and date(f.due_at at time zone 'Asia/Kolkata') = current_date
  on conflict (follow_up_id, notification_type) do nothing;

  insert into public.notifications (user_id, lead_id, follow_up_id, title, message, notification_type)
  select f.assigned_to, f.lead_id, f.id,
         'Follow-up reminder',
         'Reminder: "' || f.title || '" for ' || l.name || ' is now due.',
         'follow_up_reminder'
  from public.follow_ups f
  join public.leads l on l.id = f.lead_id
  where f.assigned_to = p_user_id
    and f.status = 'pending'
    and f.reminder_at is not null
    and f.reminder_at <= now()
  on conflict (follow_up_id, notification_type) do nothing;
end $$;

-- ============================================================
-- Transactional lead import.
-- p_rows:  jsonb array of validated lead objects:
--   { name, company_name, phone, email, city, lead_source,
--     interested_product_or_service, estimated_deal_value, priority, general_remarks }
-- p_batch: jsonb { original_filename, uploaded_by, total_rows, valid_rows,
--                  invalid_rows, duplicate_rows, skipped_duplicates, signature_hash,
--                  error_rows: [ { row_number, raw_row_data, error_messages } ] }
-- Returns the completed import_batches row as jsonb.
-- ============================================================
create or replace function public.import_leads(p_rows jsonb, p_batch jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_batch_id uuid;
  r          jsonb;
  v_count    int := 0;
  v_result   jsonb;
begin
  insert into public.import_batches (
    original_filename, uploaded_by, total_rows, valid_rows, invalid_rows,
    duplicate_rows, skipped_duplicates, import_status, signature_hash
  ) values (
    p_batch ->> 'original_filename',
    (p_batch ->> 'uploaded_by')::uuid,
    coalesce((p_batch ->> 'total_rows')::int, 0),
    coalesce((p_batch ->> 'valid_rows')::int, 0),
    coalesce((p_batch ->> 'invalid_rows')::int, 0),
    coalesce((p_batch ->> 'duplicate_rows')::int, 0),
    coalesce((p_batch ->> 'skipped_duplicates')::int, 0),
    'processing',
    p_batch ->> 'signature_hash'
  )
  on conflict (signature_hash) do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    -- already imported: return existing batch
    select row_to_json(b) into v_result from public.import_batches b where b.signature_hash = p_batch ->> 'signature_hash';
    return v_result;
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.leads (
      lead_code, name, company_name, phone, email, city, lead_source,
      interested_product_or_service, estimated_deal_value, priority,
      status, import_batch_id, created_by
    ) values (
      public.next_lead_code(),
      r ->> 'name',
      nullif(r ->> 'company_name', ''),
      r ->> 'phone',
      nullif(r ->> 'email', ''),
      nullif(r ->> 'city', ''),
      nullif(r ->> 'lead_source', ''),
      nullif(r ->> 'interested_product_or_service', ''),
      case when r ->> 'estimated_deal_value' is null or r ->> 'estimated_deal_value' = ''
           then null else (r ->> 'estimated_deal_value')::numeric end,
      coalesce(nullif(r ->> 'priority', ''), 'medium'),
      'new',
      v_batch_id,
      (p_batch ->> 'uploaded_by')::uuid
    );
    v_count := v_count + 1;
  end loop;

  insert into public.import_errors (import_batch_id, row_number, raw_row_data, error_messages)
  select v_batch_id, (e ->> 'row_number')::int, e -> 'raw_row_data', e -> 'error_messages'
  from jsonb_array_elements(coalesce(p_batch -> 'error_rows', '[]'::jsonb)) as e;

  update public.import_batches
     set imported_rows = v_count,
         import_status = 'completed',
         completed_at = now()
   where id = v_batch_id;

  select row_to_json(b) into v_result from public.import_batches b where b.id = v_batch_id;
  return v_result;
end $$;

-- ============================================================
-- Report functions (p_user_id null = all data; otherwise scoped
-- to leads assigned to that user)
-- ============================================================
create or replace function public.report_summary(p_from timestamptz default null, p_to timestamptz default null, p_user_id uuid default null)
returns jsonb language sql stable as $$
  with base as (
    select l.* from public.leads l
    where (p_user_id is null or l.assigned_to = p_user_id)
      and (p_from is null or l.created_at >= p_from)
      and (p_to   is null or l.created_at <= p_to)
  ),
  agg as (
    select
      count(*)                                                    as total_leads,
      count(*) filter (where status = 'new')                      as new_leads,
      count(*) filter (where status not in ('won','lost','on_hold')) as active_leads,
      count(*) filter (where status = 'qualified')                as qualified_leads,
      count(*) filter (where status = 'won')                      as won_leads,
      count(*) filter (where status = 'lost')                     as lost_leads,
      coalesce(sum(estimated_deal_value) filter (where status not in ('won','lost')), 0) as pipeline_value,
      count(*) filter (where status = 'won') + count(*) filter (where status = 'lost')   as decided
    from base
  ),
  fu as (
    select
      count(*) filter (where status = 'pending' and date(due_at at time zone 'Asia/Kolkata') = current_date) as due_today,
      count(*) filter (where status = 'pending' and due_at < now()) as overdue
    from public.follow_ups f
    where (p_user_id is null or f.assigned_to = p_user_id)
  ),
  emp as (
    select coalesce(p.full_name, 'Unassigned') as name, count(*) as lead_count
    from base l left join public.profiles p on p.id = l.assigned_to
    group by p.full_name
    order by count(*) desc, p.full_name
    limit 10
  ),
  by_status as (
    select jsonb_agg(jsonb_build_object('status', status, 'count', cnt) order by cnt desc) as rows
    from (select status, count(*) as cnt from base group by status) s
  ),
  by_source as (
    select jsonb_agg(jsonb_build_object('source', coalesce(source, 'Unspecified'), 'count', cnt) order by cnt desc) as rows
    from (select lead_source as source, count(*) as cnt from base group by lead_source) s
  ),
  recent_act as (
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id, 'lead_id', a.lead_id, 'user_id', a.user_id,
        'activity_type', a.activity_type, 'subject', a.subject,
        'remarks', a.remarks, 'outcome', a.outcome, 'created_at', a.created_at,
        'user_name', p.full_name, 'lead_name', l.name
      ) order by a.created_at desc
    ) as rows
    from public.activities a
    join public.leads l on l.id = a.lead_id
    left join public.profiles p on p.id = a.user_id
    where (p_user_id is null or l.assigned_to = p_user_id)
    order by a.created_at desc
    limit 5
  ),
  recent_imp as (
    select jsonb_agg(row_to_json(b) order by b.created_at desc) as rows
    from public.import_batches b
    limit 3
  )
  select jsonb_build_object(
    'total_leads', a.total_leads,
    'new_leads', a.new_leads,
    'active_leads', a.active_leads,
    'qualified_leads', a.qualified_leads,
    'won_leads', a.won_leads,
    'lost_leads', a.lost_leads,
    'pipeline_value', a.pipeline_value,
    'conversion_rate', case when a.decided = 0 then 0.0
        else round(100.0 * count_won / a.decided, 1) end,
    'follow_ups_due_today', f.due_today,
    'overdue_follow_ups', f.overdue,
    'employee_distribution', emp.rows,
    'leads_by_status', bs.rows,
    'leads_by_source', bsrc.rows,
    'recent_activities', ra.rows,
    'recent_imports', ri.rows
  )
  from agg a
  cross join fu f
  cross join (select count(*) filter (where status = 'won') as count_won from base) w
  cross join emp
  cross join by_status bs
  cross join by_source bsrc
  cross join recent_act ra
  cross join recent_imp ri;
$$;

create or replace function public.report_leads_by_status(p_user_id uuid default null)
returns table (status text, count bigint, value numeric)
language sql stable as $$
  select status, count(*), coalesce(sum(estimated_deal_value), 0)
  from public.leads l
  where (p_user_id is null or l.assigned_to = p_user_id)
  group by status
  order by count(*) desc;
$$;

create or replace function public.report_leads_by_source(p_user_id uuid default null)
returns table (source text, count bigint, value numeric)
language sql stable as $$
  select coalesce(lead_source, 'Unspecified'), count(*), coalesce(sum(estimated_deal_value), 0)
  from public.leads l
  where (p_user_id is null or l.assigned_to = p_user_id)
  group by lead_source
  order by count(*) desc;
$$;

create or replace function public.report_leads_over_time(p_days int default 90, p_user_id uuid default null)
returns table (date text, count bigint)
language sql stable as $$
  select to_char(d.day, 'YYYY-MM-DD'), count(l.id)
  from generate_series(current_date - (p_days - 1), current_date, interval '1 day') as d(day)
  left join public.leads l
    on l.created_at >= d.day
   and l.created_at < d.day + interval '1 day'
   and (p_user_id is null or l.assigned_to = p_user_id)
  group by d.day
  order by d.day;
$$;

create or replace function public.report_performance()
returns table (user_id uuid, name text, assigned bigint, won bigint, lost bigint,
               conversion_rate numeric, pipeline_value numeric, overdue_follow_ups bigint)
language sql stable as $$
  select p.id, p.full_name,
         count(l.id) filter (where l.id is not null),
         count(l.id) filter (where l.status = 'won'),
         count(l.id) filter (where l.status = 'lost'),
         case when count(l.id) filter (where l.status in ('won','lost')) = 0 then 0.0
              else round(100.0 * count(l.id) filter (where l.status = 'won')
                       / count(l.id) filter (where l.status in ('won','lost')), 1) end,
         coalesce(sum(l.estimated_deal_value) filter (where l.status not in ('won','lost')), 0),
         (select count(*) from public.follow_ups f
           where f.assigned_to = p.id and f.status = 'pending' and f.due_at < now())
  from public.profiles p
  left join public.leads l on l.assigned_to = p.id
  where p.is_active
  group by p.id, p.full_name
  order by count(l.id) desc, p.full_name;
$$;

create or replace function public.report_lost_reasons(p_user_id uuid default null)
returns table (reason text, count bigint)
language sql stable as $$
  select coalesce(h.reason, '(no reason given)'), count(*)
  from public.lead_status_history h
  join public.leads l on l.id = h.lead_id
  where h.new_status = 'lost'
    and (p_user_id is null or l.assigned_to = p_user_id)
  group by h.reason
  order by count(*) desc;
$$;

-- ============================================================
-- Row Level Security
-- The API uses the service-role key (bypasses RLS). RLS protects
-- any direct browser access with the anon key.
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.leads               enable row level security;
alter table public.activities          enable row level security;
alter table public.follow_ups          enable row level security;
alter table public.notifications       enable row level security;
alter table public.lead_status_history enable row level security;
alter table public.import_batches      enable row level security;
alter table public.import_errors       enable row level security;
alter table public.app_settings        enable row level security;

-- profiles: read own; admins read all; admins update (role control)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());
-- insert happens only through the security-definer trigger

-- leads: users see own assigned leads; admins see all
drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads for select
  using (assigned_to = auth.uid() or public.is_admin());
drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads for insert
  with check (public.is_admin() or assigned_to = auth.uid() or assigned_to is null);
drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update
  using (assigned_to = auth.uid() or public.is_admin())
  with check (public.is_admin() or assigned_to = auth.uid() or assigned_to is null);
-- no delete policy: leads are never hard-deleted (safe by design)

-- activities: visible where the lead is visible; users log own
drop policy if exists "activities_select" on public.activities;
create policy "activities_select" on public.activities for select
  using (exists (select 1 from public.leads l where l.id = activities.lead_id
                 and (l.assigned_to = auth.uid() or public.is_admin())));
drop policy if exists "activities_insert" on public.activities;
create policy "activities_insert" on public.activities for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.leads l where l.id = activities.lead_id
    and (l.assigned_to = auth.uid() or public.is_admin())));

-- follow_ups: users manage their own; admins all
drop policy if exists "follow_ups_select" on public.follow_ups;
create policy "follow_ups_select" on public.follow_ups for select
  using (assigned_to = auth.uid() or public.is_admin());
drop policy if exists "follow_ups_insert" on public.follow_ups;
create policy "follow_ups_insert" on public.follow_ups for insert
  with check (assigned_to = auth.uid() or public.is_admin());
drop policy if exists "follow_ups_update" on public.follow_ups;
create policy "follow_ups_update" on public.follow_ups for update
  using (assigned_to = auth.uid() or public.is_admin())
  with check (assigned_to = auth.uid() or public.is_admin());

-- notifications: own only
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select
  using (user_id = auth.uid());
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert
  with check (user_id = auth.uid());
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- status history: readable where the lead is visible; service writes
drop policy if exists "lsh_select" on public.lead_status_history;
create policy "lsh_select" on public.lead_status_history for select
  using (exists (select 1 from public.leads l where l.id = lead_status_history.lead_id
                 and (l.assigned_to = auth.uid() or public.is_admin())));

-- import tables: NO policies -> direct access denied; service role only
-- app_settings: readable by all authenticated; writable by admins
drop policy if exists "settings_select" on public.app_settings;
create policy "settings_select" on public.app_settings for select
  using (auth.uid() is not null);
drop policy if exists "settings_admin_update" on public.app_settings;
create policy "settings_admin_update" on public.app_settings for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "settings_admin_insert" on public.app_settings;
create policy "settings_admin_insert" on public.app_settings for insert
  with check (public.is_admin());
