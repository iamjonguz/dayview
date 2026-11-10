-- Dayview schema: users, groups, templates, routines, dated cards, progress, personal placement, layouts.
-- Every table has row-level security. Nothing here relies on IDs being secret.


-- =====================================================================
-- Profiles & preferences
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Me',
  timezone text not null default 'UTC',
  default_density text not null default 'comfortable' check (default_density in ('compact', 'comfortable')),
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Groups, memberships, invitations
-- =====================================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.group_members (user_id);

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'declined')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create unique index group_invitations_one_pending on public.group_invitations (group_id, email) where status = 'pending';
create index on public.group_invitations (email);

-- Security-definer helpers: avoid RLS recursion and keep policies readable.
create function public.group_role(gid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.group_members where group_id = gid and user_id = auth.uid()
$$;
create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid())
$$;
create function public.can_edit_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.group_role(gid) in ('owner', 'editor'), false)
$$;
create function public.shares_group_with(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid)
$$;

-- Creating a group makes its creator the owner.
create function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger groups_add_owner after insert on public.groups
  for each row execute function public.add_owner_member();

-- A member who leaves (or is removed) takes their shared cards back; the cards become private again.
create function public.unshare_cards_of_removed_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.card_instances set group_id = null where group_id = old.group_id and owner_id = old.user_id;
  return old;
end $$;

-- Only the invited email address can accept; knowing the invitation id grants nothing.
create function public.respond_invitation(inv_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare inv public.group_invitations; me_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into inv from public.group_invitations where id = inv_id for update;
  if not found or inv.status <> 'pending' or inv.expires_at < now() or inv.email <> me_email then
    raise exception 'invitation is not valid for this account' using errcode = '42501';
  end if;
  if accept then
    insert into public.group_members (group_id, user_id, role) values (inv.group_id, auth.uid(), inv.role)
    on conflict do nothing;
    update public.group_invitations set status = 'accepted' where id = inv_id;
  else
    update public.group_invitations set status = 'declined' where id = inv_id;
  end if;
end $$;

-- Invitations addressed to me, including the group name (I'm not a member yet, so I can't read the group).
create function public.my_invitations() returns table (id uuid, group_id uuid, group_name text, email text, role text, status text, invited_by uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.group_id, g.name, i.email, i.role, i.status, i.invited_by, i.created_at
  from public.group_invitations i join public.groups g on g.id = i.group_id
  where i.email = lower(coalesce(auth.jwt() ->> 'email', '')) and i.status = 'pending' and i.expires_at > now()
$$;

-- =====================================================================
-- Library: templates, routines (series), layouts, sections
-- =====================================================================
create table public.card_templates (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  description text,
  spec jsonb not null,
  created_at timestamptz not null default now()
);

create table public.sections (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  icon text not null default 'none',
  from_time text,
  position int not null default 0
);

create table public.series (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  spec jsonb not null,
  rule jsonb not null,
  section_id uuid references public.sections (id) on delete set null,
  rev int not null default 1,
  created_at timestamptz not null default now()
);

create table public.day_layouts (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  auto_apply int[] not null default '{}',
  entries jsonb not null default '[]'
);

create table public.layout_applications (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  layout_id uuid not null references public.day_layouts (id) on delete cascade,
  date date not null,
  primary key (user_id, layout_id, date)
);

-- =====================================================================
-- Dated cards, progress, personal placement
-- =====================================================================
create table public.card_instances (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  group_id uuid references public.groups (id) on delete set null,
  series_id uuid references public.series (id) on delete set null,
  date date not null,
  spec jsonb not null, -- snapshot: content blocks are ordered jsonb with stable ids
  completion_mode text not null default 'together' check (completion_mode in ('together', 'individual')),
  skipped boolean not null default false,
  rev int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  -- one generated occurrence per routine per day; NULL series_id (one-offs) never conflict
  constraint card_instances_series_day unique (series_id, date)
);
create index on public.card_instances (owner_id, date);
create index on public.card_instances (group_id, date);

create trigger group_members_unshare after delete on public.group_members
  for each row execute function public.unshare_cards_of_removed_member();

create table public.card_progress (
  instance_id uuid not null references public.card_instances (id) on delete cascade,
  scope text not null, -- 'shared' (complete together) or a user id (personal / each person completes)
  state jsonb not null default '{"completed":false,"checks":{},"values":{}}',
  rev int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (instance_id, scope)
);

create table public.placements (
  instance_id uuid not null references public.card_instances (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  section_id uuid references public.sections (id) on delete set null,
  position int not null default 0,
  hidden boolean not null default false,
  density text check (density in ('compact', 'comfortable')),
  primary key (instance_id, user_id)
);

create function public.can_see_instance(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.card_instances i
    where i.id = iid and ((i.group_id is null and i.owner_id = auth.uid()) or (i.group_id is not null and public.is_group_member(i.group_id)))
  )
$$;

create function public.can_write_progress(iid uuid, sc text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.card_instances i
    where i.id = iid and (
      (i.group_id is null and i.owner_id = auth.uid() and sc = auth.uid()::text)
      or (i.group_id is not null and i.completion_mode = 'together' and sc = 'shared' and public.can_edit_group(i.group_id))
      or (i.group_id is not null and i.completion_mode = 'individual' and sc = auth.uid()::text and public.is_group_member(i.group_id))
    )
  )
$$;

-- Optimistic concurrency + guard rails for card edits.
create function public.guard_instance_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'owner cannot change' using errcode = '42501'; end if;
  if new.group_id is distinct from old.group_id then
    -- only the creator may change sharing, and only into a group where they can edit
    if old.owner_id <> auth.uid() or (new.group_id is not null and not public.can_edit_group(new.group_id)) then
      raise exception 'only the creator can change sharing' using errcode = '42501';
    end if;
  end if;
  new.rev := old.rev + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger card_instances_guard before update on public.card_instances
  for each row execute function public.guard_instance_update();

create function public.bump_series_rev() returns trigger language plpgsql as $$
begin new.rev := old.rev + 1; return new; end $$;
create trigger series_bump before update on public.series for each row execute function public.bump_series_rev();

-- Merge-patch progress so two people ticking different items never overwrite each other.
create function public.patch_progress(inst uuid, sc text, patch jsonb) returns public.card_progress
language plpgsql set search_path = public as $$
declare result public.card_progress;
begin
  insert into public.card_progress (instance_id, scope, state)
  values (inst, sc, jsonb_build_object(
    'completed', coalesce(patch -> 'completed', 'false'::jsonb),
    'checks', coalesce(patch -> 'checks', '{}'::jsonb),
    'values', coalesce(patch -> 'values', '{}'::jsonb)))
  on conflict (instance_id, scope) do update set
    state = jsonb_build_object(
      'completed', coalesce(patch -> 'completed', card_progress.state -> 'completed', 'false'::jsonb),
      'checks', coalesce(card_progress.state -> 'checks', '{}'::jsonb) || coalesce(patch -> 'checks', '{}'::jsonb),
      'values', coalesce(card_progress.state -> 'values', '{}'::jsonb) || coalesce(patch -> 'values', '{}'::jsonb)),
    rev = card_progress.rev + 1,
    updated_at = now()
  returning * into result;
  return result;
end $$;

-- =====================================================================
-- Row level security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.card_templates enable row level security;
alter table public.sections enable row level security;
alter table public.series enable row level security;
alter table public.day_layouts enable row level security;
alter table public.layout_applications enable row level security;
alter table public.card_instances enable row level security;
alter table public.card_progress enable row level security;
alter table public.placements enable row level security;

-- profiles: me, and people I share a group with
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());

-- groups
create policy groups_select on public.groups for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated with check (owner_id = auth.uid());
create policy groups_update on public.groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_delete on public.groups for delete to authenticated using (owner_id = auth.uid());

-- members: visible to fellow members; the owner manages roles and removals; anyone may leave (not the owner)
create policy members_select on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy members_update on public.group_members for update to authenticated
  using (public.group_role(group_id) = 'owner' and role <> 'owner')
  with check (role in ('editor', 'viewer'));
create policy members_delete on public.group_members for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.group_role(group_id) = 'owner'));
-- no insert policy: members are only added through respond_invitation() / the owner trigger

-- invitations: owner manages; invitees read theirs through my_invitations() and answer through respond_invitation()
create policy invitations_select on public.group_invitations for select to authenticated
  using (public.group_role(group_id) = 'owner');
create policy invitations_insert on public.group_invitations for insert to authenticated
  with check (public.group_role(group_id) = 'owner' and invited_by = auth.uid() and status = 'pending');
create policy invitations_revoke on public.group_invitations for update to authenticated
  using (public.group_role(group_id) = 'owner' and status = 'pending')
  with check (public.group_role(group_id) = 'owner' and status = 'revoked');

-- strictly personal data
create policy templates_all on public.card_templates for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy sections_all on public.sections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy series_all on public.series for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy layouts_all on public.day_layouts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy layout_apps_all on public.layout_applications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- cards: private to the owner, or visible to members of the group they are shared with
create policy instances_select on public.card_instances for select to authenticated
  using ((group_id is null and owner_id = auth.uid()) or (group_id is not null and public.is_group_member(group_id)));
create policy instances_insert on public.card_instances for insert to authenticated
  with check (owner_id = auth.uid() and (group_id is null or public.can_edit_group(group_id)));
create policy instances_update on public.card_instances for update to authenticated
  using ((group_id is null and owner_id = auth.uid()) or (group_id is not null and public.can_edit_group(group_id)))
  with check ((group_id is null and owner_id = auth.uid()) or (group_id is not null and public.can_edit_group(group_id)));
create policy instances_delete on public.card_instances for delete to authenticated
  using ((group_id is null and owner_id = auth.uid()) or (group_id is not null and public.can_edit_group(group_id)));

-- progress: readable wherever the card is; writable per the completion mode and role
create policy progress_select on public.card_progress for select to authenticated using (public.can_see_instance(instance_id));
create policy progress_insert on public.card_progress for insert to authenticated with check (public.can_write_progress(instance_id, scope));
create policy progress_update on public.card_progress for update to authenticated
  using (public.can_write_progress(instance_id, scope)) with check (public.can_write_progress(instance_id, scope));

-- placement: strictly mine, and only for cards I can see
create policy placements_all on public.placements for all to authenticated
  using (user_id = auth.uid() and public.can_see_instance(instance_id))
  with check (user_id = auth.uid() and public.can_see_instance(instance_id));

-- =====================================================================
-- Privileges (RLS is the gate; anonymous users get nothing)
-- =====================================================================
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert on public.group_members from authenticated;
revoke execute on all functions in schema public from anon, public;
grant execute on function
  public.group_role(uuid), public.is_group_member(uuid), public.can_edit_group(uuid), public.shares_group_with(uuid),
  public.can_see_instance(uuid), public.can_write_progress(uuid, text), public.respond_invitation(uuid, boolean),
  public.my_invitations(), public.patch_progress(uuid, text, jsonb)
  to authenticated;

-- Realtime: members receive changes to the cards and progress they can see (RLS applies to realtime too).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.card_instances, public.card_progress, public.group_members, public.group_invitations, public.groups;
  end if;
end $$;
