-- Hidden developer tools: an is_dev flag on users, gated at the database layer
-- (not just in the Next.js route) because create_app_invite below is reachable
-- directly via the Supabase client, same reasoning as create_invite's owner
-- check. See CLAUDE.md's "Hidden dev tools" note.

alter table users add column is_dev boolean not null default false;

-- RLS is row-scoped, not column-scoped: the existing users_update_self policy
-- (id = auth.uid()) combined with a blanket `grant update on users` would let
-- any user set their own is_dev to true. Re-grant update only for the columns
-- a household member should ever self-edit; is_dev becomes settable only by
-- the service role / dashboard SQL editor from here on.
revoke update on users from authenticated;
grant update (display_name, avatar_colour) on users to authenticated;

-- Grants app access without creating an invites row or touching a household —
-- the invitee lands on /welcome and builds their own, rather than joining the
-- caller's. Gated on is_dev rather than "household owner" (create_invite's
-- check) because this isn't a household-scoped permission at all.
create or replace function public.create_app_invite(invite_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  normalised text := lower(trim(invite_email));
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from users where id = caller and is_dev) then
    raise exception 'not_authorized';
  end if;

  if normalised = '' or normalised not like '%_@_%' then
    raise exception 'invalid_email';
  end if;

  insert into signup_allowlist (email, invited_by)
  values (normalised, caller)
  on conflict (email) do nothing;
end;
$$;

revoke execute on function public.create_app_invite(text) from anon;
