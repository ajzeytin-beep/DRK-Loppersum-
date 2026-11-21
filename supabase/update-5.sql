-- DRK OV Loppersum – Update 5: Vereinsverwaltung (Kassenbuch, Mitglieder, Konten, Zugänge)
-- Einmal im Supabase „SQL Editor“ ausführen (neue Abfrage → einfügen → Run).
-- Voraussetzung: update-4.sql wurde ausgeführt. Bestehende Daten bleiben erhalten.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden.
--
-- Rollen in der Verwaltung (unabhängig von den Rollen im Sani-Trainer):
--   pending    = registriert, wartet auf Freigabe durch den Admin
--   admin      = alles, inkl. Zugänge freigeben/entfernen
--   kassenwart = Kassenbuch, Mitglieder, Konten bearbeiten
--   vorsitz    = wie Kassenwart
--   pruefer    = Kassenprüfer: darf alles sehen, aber nichts ändern

/* ---------------- Tabellen ---------------- */

create table if not exists public.vw_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text not null default '',
  role        text not null default 'pending' check (role in ('pending', 'admin', 'kassenwart', 'vorsitz', 'pruefer')),
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.vw_settings (
  id               int primary key default 1 check (id = 1),
  drinks_fee_cents bigint not null default 0 check (drinks_fee_cents >= 0),
  updated_at       timestamptz not null default now()
);
insert into public.vw_settings (id) values (1) on conflict (id) do nothing;

-- Konten: Barkasse(n) und Bankkonten. Anfangsbestand getrennt nach Getränkekasse und Verein.
create table if not exists public.vw_accounts (
  id                    bigint generated always as identity primary key,
  name                  text not null check (length(trim(name)) between 1 and 60),
  kind                  text not null check (kind in ('bar', 'bank')),
  iban                  text,
  bank                  text,
  start_getraenke_cents bigint not null default 0,
  start_verein_cents    bigint not null default 0,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);
insert into public.vw_accounts (name, kind)
select v.name, v.kind from (values ('Barkasse', 'bar'), ('Bankkonto', 'bank')) as v(name, kind)
where not exists (select 1 from public.vw_accounts);

create table if not exists public.vw_members (
  id               bigint generated always as identity primary key,
  last_name        text not null default '',
  first_name       text not null default '',
  street           text,
  zip              text,
  city             text,
  birthday         date,
  entry_date       date,
  exit_date        date,
  drinks_fee_cents bigint check (drinks_fee_cents >= 0),  -- Getränkepauschale pro Jahr, leer = nimmt nicht teil
  phone            text,
  email            text,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Kassenbuch. Belegnummer fortlaufend pro Jahr: 00001-26, 00002-26 … 00001-27.
-- Buchungen werden nie gelöscht oder geändert, sondern storniert (Gegenbuchung mit negativem Betrag).
create table if not exists public.vw_bookings (
  id              bigint generated always as identity primary key,
  number          text not null unique,
  year            int not null,
  seq             int not null,
  booking_date    date not null,
  area            text not null check (area in ('getraenke', 'verein')),
  kind            text not null check (kind in ('einnahme', 'ausgabe', 'umbuchung')),
  account_id      bigint not null references public.vw_accounts(id),
  to_account_id   bigint references public.vw_accounts(id),
  amount_cents    bigint not null check (amount_cents <> 0),
  purpose         text not null,
  category        text,
  member_id       bigint references public.vw_members(id) on delete set null,
  receipt_path    text,
  storno_of       bigint references public.vw_bookings(id),
  cancelled_by    bigint references public.vw_bookings(id),
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  unique (year, seq),
  check ((kind = 'umbuchung') = (to_account_id is not null))
);
create index if not exists vw_bookings_date_idx on public.vw_bookings(booking_date);
create index if not exists vw_bookings_member_idx on public.vw_bookings(member_id);

/* ---------------- Rechte-Prüfung ---------------- */

create or replace function public.vw_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from vw_users where id = auth.uid() and role <> 'pending';
$$;

create or replace function public.vw_can_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(vw_role() is not null, false);
$$;

create or replace function public.vw_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(vw_role() in ('admin', 'kassenwart', 'vorsitz'), false);
$$;

create or replace function public.vw_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(vw_role() = 'admin', false);
$$;

/* ---------------- Zeilenschutz (Row Level Security) ---------------- */

alter table public.vw_users    enable row level security;
alter table public.vw_settings enable row level security;
alter table public.vw_accounts enable row level security;
alter table public.vw_members  enable row level security;
alter table public.vw_bookings enable row level security;

revoke all on public.vw_users, public.vw_settings, public.vw_accounts, public.vw_members, public.vw_bookings from anon;
revoke all on public.vw_users from authenticated;                  -- nur über Funktionen
revoke insert, update, delete on public.vw_bookings from authenticated;  -- nur über Funktionen
grant select, update on public.vw_settings to authenticated;
grant select, insert, update, delete on public.vw_accounts, public.vw_members to authenticated;
grant select on public.vw_bookings to authenticated;

drop policy if exists vw_settings_read  on public.vw_settings;
drop policy if exists vw_settings_write on public.vw_settings;
create policy vw_settings_read  on public.vw_settings for select to authenticated using (vw_can_read());
create policy vw_settings_write on public.vw_settings for update to authenticated using (vw_can_write()) with check (vw_can_write());

drop policy if exists vw_accounts_read   on public.vw_accounts;
drop policy if exists vw_accounts_insert on public.vw_accounts;
drop policy if exists vw_accounts_update on public.vw_accounts;
drop policy if exists vw_accounts_delete on public.vw_accounts;
create policy vw_accounts_read   on public.vw_accounts for select to authenticated using (vw_can_read());
create policy vw_accounts_insert on public.vw_accounts for insert to authenticated with check (vw_can_write());
create policy vw_accounts_update on public.vw_accounts for update to authenticated using (vw_can_write()) with check (vw_can_write());
create policy vw_accounts_delete on public.vw_accounts for delete to authenticated using (vw_can_write());

drop policy if exists vw_members_read   on public.vw_members;
drop policy if exists vw_members_insert on public.vw_members;
drop policy if exists vw_members_update on public.vw_members;
drop policy if exists vw_members_delete on public.vw_members;
create policy vw_members_read   on public.vw_members for select to authenticated using (vw_can_read());
create policy vw_members_insert on public.vw_members for insert to authenticated with check (vw_can_write());
create policy vw_members_update on public.vw_members for update to authenticated using (vw_can_write()) with check (vw_can_write());
create policy vw_members_delete on public.vw_members for delete to authenticated using (vw_can_write());

drop policy if exists vw_bookings_read on public.vw_bookings;
create policy vw_bookings_read on public.vw_bookings for select to authenticated using (vw_can_read());

/* ---------------- Registrierung ---------------- */

-- Konten, die über die Verwaltung registriert werden, landen NICHT in der Teilnehmerliste
-- des Sani-Trainers, sondern warten in der Verwaltung auf die Freigabe durch den Admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'app', '') = 'verwaltung' then
    insert into public.vw_users (id, email, name)
    values (new.id, new.email, left(coalesce(trim(new.raw_user_meta_data->>'name'), ''), 60))
    on conflict (id) do nothing;
    return new;
  end if;
  insert into public.profiles (id, display_name, email, requested_course)
  values (
    new.id,
    left(coalesce(trim(new.raw_user_meta_data->>'name'), ''), 40),
    new.email,
    nullif(upper(trim(coalesce(new.raw_user_meta_data->>'course', ''))), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

/* ---------------- Funktionen: eigener Zugang ---------------- */

-- Eigener Verwaltungs-Zugang. Wer sich mit einem bestehenden Konto (z. B. aus dem Sani-Trainer)
-- anmeldet, wird automatisch als „wartet auf Freigabe“ eingetragen.
create or replace function public.vw_me()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u vw_users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  select * into u from vw_users where id = auth.uid();
  if u.id is null then
    insert into vw_users (id, email, name)
    select a.id, a.email,
           left(coalesce(nullif(trim(a.raw_user_meta_data->>'name'), ''),
                         (select display_name from profiles p where p.id = a.id), ''), 60)
      from auth.users a where a.id = auth.uid()
    on conflict (id) do nothing;
    select * into u from vw_users where id = auth.uid();
  end if;
  return json_build_object('id', u.id, 'email', u.email, 'name', u.name, 'role', u.role);
end;
$$;

create or replace function public.vw_update_my_name(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := left(trim(coalesce(p_name, '')), 60);
begin
  if v = '' then
    raise exception 'Name fehlt';
  end if;
  update vw_users set name = v where id = auth.uid();
  return true;
end;
$$;

/* ---------------- Funktionen: Zugänge verwalten (nur Admin) ---------------- */

create or replace function public.vw_list_users()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not vw_is_admin() then
    raise exception 'Keine Berechtigung';
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', id, 'email', email, 'name', name, 'role', role,
      'created_at', created_at, 'approved_at', approved_at, 'me', id = auth.uid()
    ) order by role = 'pending' desc, name)
    from vw_users
  ), '[]'::json);
end;
$$;

-- Freigeben oder Rolle ändern
create or replace function public.vw_set_role(p_user uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not vw_is_admin() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_role not in ('admin', 'kassenwart', 'vorsitz', 'pruefer') then
    raise exception 'Unbekannte Rolle';
  end if;
  if p_user = auth.uid() then
    raise exception 'Deine eigene Rolle kannst du nicht ändern';
  end if;
  update vw_users
     set role = p_role,
         approved_at = coalesce(approved_at, now())
   where id = p_user;
  if not found then
    raise exception 'Zugang nicht gefunden';
  end if;
  return true;
end;
$$;

-- Zugang entfernen (z. B. wenn ein neuer Kassenwart gewählt wurde).
-- Das Konto selbst wird nur gelöscht, wenn es nicht auch im Sani-Trainer genutzt wird.
-- Buchungen bleiben erhalten, der Name des Buchenden ist dort gespeichert.
create or replace function public.vw_remove_user(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not vw_is_admin() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_user = auth.uid() then
    raise exception 'Du kannst deinen eigenen Zugang nicht entfernen';
  end if;
  delete from vw_users where id = p_user;
  if not found then
    raise exception 'Zugang nicht gefunden';
  end if;
  if not exists (select 1 from profiles where id = p_user) then
    begin
      delete from auth.users where id = p_user;
    exception when others then
      null;  -- ohne Rechte bleibt das Konto bestehen, hat aber keinen Zugang mehr
    end;
  end if;
  return true;
end;
$$;

/* ---------------- Funktionen: Kassenbuch ---------------- */

create or replace function public._vw_next_number(p_year int, out o_seq int, out o_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(470115, p_year);  -- verhindert doppelte Nummern
  select coalesce(max(seq), 0) + 1 into o_seq from vw_bookings where year = p_year;
  o_number := lpad(o_seq::text, 5, '0') || '-' || lpad((p_year % 100)::text, 2, '0');
end;
$$;

create or replace function public.vw_add_booking(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date    date   := coalesce(nullif(p->>'date', '')::date, current_date);
  v_year    int    := extract(year from v_date)::int;
  v_kind    text   := p->>'kind';
  v_area    text   := p->>'area';
  v_amount  bigint := nullif(p->>'amount_cents', '')::bigint;
  v_acc     bigint := nullif(p->>'account_id', '')::bigint;
  v_to      bigint := nullif(p->>'to_account_id', '')::bigint;
  v_member  bigint := nullif(p->>'member_id', '')::bigint;
  v_purpose text   := left(trim(coalesce(p->>'purpose', '')), 300);
  v_cat     text   := nullif(left(trim(coalesce(p->>'category', '')), 60), '');
  v_receipt text   := nullif(left(coalesce(p->>'receipt_path', ''), 200), '');
  v_seq     int;
  v_num     text;
  v_id      bigint;
begin
  if not vw_can_write() then
    raise exception 'Keine Berechtigung';
  end if;
  if v_kind not in ('einnahme', 'ausgabe', 'umbuchung') then
    raise exception 'Bitte Einnahme, Ausgabe oder Umbuchung wählen';
  end if;
  if v_area not in ('getraenke', 'verein') then
    raise exception 'Bitte Bereich wählen (Getränkekasse oder Verein)';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Der Betrag muss größer als 0 sein';
  end if;
  if v_amount > 100000000 then
    raise exception 'Der Betrag ist zu hoch';
  end if;
  if v_date > current_date + 366 or v_date < date '2000-01-01' then
    raise exception 'Das Datum ist ungültig';
  end if;
  if v_purpose = '' then
    raise exception 'Der Verwendungszweck fehlt';
  end if;
  if not exists (select 1 from vw_accounts where id = v_acc and active) then
    raise exception 'Bitte ein Konto wählen';
  end if;
  if v_kind = 'umbuchung' then
    if v_to is null or v_to = v_acc or not exists (select 1 from vw_accounts where id = v_to and active) then
      raise exception 'Bitte ein anderes Zielkonto wählen';
    end if;
  else
    v_to := null;
  end if;
  if v_member is not null and not exists (select 1 from vw_members where id = v_member) then
    v_member := null;
  end if;

  select o_seq, o_number into v_seq, v_num from _vw_next_number(v_year);
  insert into vw_bookings (number, year, seq, booking_date, area, kind, account_id, to_account_id,
                           amount_cents, purpose, category, member_id, receipt_path, created_by, created_by_name)
  values (v_num, v_year, v_seq, v_date, v_area, v_kind, v_acc, v_to,
          v_amount, v_purpose, v_cat, v_member, v_receipt, auth.uid(),
          (select coalesce(nullif(name, ''), email) from vw_users where id = auth.uid()))
  returning id into v_id;
  return json_build_object('id', v_id, 'number', v_num);
end;
$$;

-- Stornieren: Gegenbuchung mit negativem Betrag, Datum heute, neue Belegnummer
create or replace function public.vw_cancel_booking(p_id bigint, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  b      vw_bookings%rowtype;
  v_year int := extract(year from current_date)::int;
  v_seq  int;
  v_num  text;
  v_id   bigint;
begin
  if not vw_can_write() then
    raise exception 'Keine Berechtigung';
  end if;
  select * into b from vw_bookings where id = p_id for update;
  if b.id is null then
    raise exception 'Buchung nicht gefunden';
  end if;
  if b.storno_of is not null then
    raise exception 'Eine Storno-Buchung kann nicht storniert werden';
  end if;
  if b.cancelled_by is not null then
    raise exception 'Diese Buchung wurde bereits storniert';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Bitte einen Grund für das Storno angeben';
  end if;

  select o_seq, o_number into v_seq, v_num from _vw_next_number(v_year);
  insert into vw_bookings (number, year, seq, booking_date, area, kind, account_id, to_account_id,
                           amount_cents, purpose, category, member_id, storno_of, created_by, created_by_name)
  values (v_num, v_year, v_seq, current_date, b.area, b.kind, b.account_id, b.to_account_id,
          -b.amount_cents, left('Storno zu ' || b.number || ': ' || trim(p_reason), 300), b.category, b.member_id,
          b.id, auth.uid(),
          (select coalesce(nullif(name, ''), email) from vw_users where id = auth.uid()))
  returning id into v_id;
  update vw_bookings set cancelled_by = v_id where id = b.id;
  return json_build_object('id', v_id, 'number', v_num);
end;
$$;

-- Beleg (Foto/PDF) nachträglich an eine Buchung hängen
create or replace function public.vw_set_receipt(p_id bigint, p_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not vw_can_write() then
    raise exception 'Keine Berechtigung';
  end if;
  update vw_bookings set receipt_path = nullif(left(coalesce(p_path, ''), 200), '') where id = p_id;
  if not found then
    raise exception 'Buchung nicht gefunden';
  end if;
  return true;
end;
$$;

/* ---------------- Belege (Fotos) im Speicher ---------------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vw-belege', 'vw-belege', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "vw belege lesen"     on storage.objects;
drop policy if exists "vw belege hochladen" on storage.objects;
create policy "vw belege lesen"     on storage.objects for select to authenticated using (bucket_id = 'vw-belege' and public.vw_can_read());
create policy "vw belege hochladen" on storage.objects for insert to authenticated with check (bucket_id = 'vw-belege' and public.vw_can_write());
-- Bewusst kein Ändern/Löschen: Belege bleiben für die Kassenprüfung erhalten.

/* ---------------- Rechte an den Funktionen ---------------- */

revoke all on function public._vw_next_number(int)           from public, anon, authenticated;
revoke all on function public.vw_role()                      from public, anon;
revoke all on function public.vw_can_read()                  from public, anon;
revoke all on function public.vw_can_write()                 from public, anon;
revoke all on function public.vw_is_admin()                  from public, anon;
revoke all on function public.vw_me()                        from public, anon;
revoke all on function public.vw_update_my_name(text)        from public, anon;
revoke all on function public.vw_list_users()                from public, anon;
revoke all on function public.vw_set_role(uuid, text)        from public, anon;
revoke all on function public.vw_remove_user(uuid)           from public, anon;
revoke all on function public.vw_add_booking(jsonb)          from public, anon;
revoke all on function public.vw_cancel_booking(bigint, text) from public, anon;
revoke all on function public.vw_set_receipt(bigint, text)   from public, anon;

grant execute on function public.vw_role()                      to authenticated;
grant execute on function public.vw_can_read()                  to authenticated;
grant execute on function public.vw_can_write()                 to authenticated;
grant execute on function public.vw_is_admin()                  to authenticated;
grant execute on function public.vw_me()                        to authenticated;
grant execute on function public.vw_update_my_name(text)        to authenticated;
grant execute on function public.vw_list_users()                to authenticated;
grant execute on function public.vw_set_role(uuid, text)        to authenticated;
grant execute on function public.vw_remove_user(uuid)           to authenticated;
grant execute on function public.vw_add_booking(jsonb)          to authenticated;
grant execute on function public.vw_cancel_booking(bigint, text) to authenticated;
grant execute on function public.vw_set_receipt(bigint, text)   to authenticated;

/* ---------------- Ersten Admin eintragen ---------------- */
-- Einmal nötig: Zuerst unter /verwaltung/ registrieren, dann hier die eigene E-Mail eintragen und ausführen:
--
--   update public.vw_users set role = 'admin', approved_at = now() where email = 'deine@email.de';
--
-- Hast du schon ein Konto im Sani-Trainer, melde dich unter /verwaltung/ einfach damit an
-- und führe danach denselben Befehl aus.
