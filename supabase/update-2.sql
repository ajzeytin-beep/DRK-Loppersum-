-- Sani-Trainer – Update 2: Konten mit E-Mail und Passwort
-- Einmal im Supabase „SQL Editor“ ausführen (neue Abfrage → einfügen → Run).
-- Voraussetzung: schema.sql und update-1.sql wurden bereits ausgeführt. Bestehende Daten bleiben erhalten.
--
-- Rollen:  pending    = registriert, wartet auf Freigabe durch Ausbilder
--          learner    = freigegeben, Fortschritt wird übertragen
--          instructor = Ausbilder (sieht und verwaltet den eigenen Kurs)
--          rejected   = abgelehnt/entfernt (falls das Konto nicht gelöscht werden konnte)

alter table public.courses alter column instructor_pin_hash drop not null;

create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null default '',
  email            text,
  role             text not null default 'pending' check (role in ('pending', 'learner', 'instructor', 'rejected')),
  course_code      text references public.courses(code) on delete set null,
  requested_course text,
  created_at       timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- Bewusst KEINE Policies: Zugriff nur über die Funktionen unten.

-- Neues Konto → Profil anlegen (Name und gewünschter Kurs kommen aus der Registrierung)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ---------------- interne Hilfsfunktionen ---------------- */

-- Kurs des angemeldeten Ausbilders (sonst Fehler)
create or replace function public._instructor_course()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c text;
begin
  select course_code into c from profiles where id = auth.uid() and role = 'instructor';
  if c is null then
    raise exception 'Keine Berechtigung';
  end if;
  return c;
end;
$$;

-- Auswertung eines Kurses (gleicher Aufbau wie course_stats aus Update 1)
create or replace function public._course_stats(p_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_course courses%rowtype;
begin
  select * into v_course from courses where code = p_code;
  return json_build_object(
    'course', json_build_object('code', v_course.code, 'name', v_course.name),
    'learners', coalesce((
      select json_agg(json_build_object(
        'id', l.id,
        'name', l.display_name,
        'email', (select p.email from profiles p where p.id = l.id),
        'last_seen', coalesce((select max(a.answered_at) from attempts a where a.learner_id = l.id), l.last_seen),
        'topics', coalesce((
          select json_object_agg(t.topic, json_build_object('n', t.n, 'c', t.c))
          from (
            select a.topic, count(*) as n, count(*) filter (where a.correct) as c
            from attempts a where a.learner_id = l.id group by a.topic
          ) t), '{}'::json),
        'mastered', coalesce((
          select json_object_agg(m.level, m.n)
          from (
            select x.level, count(*) as n
            from (
              select distinct on (a.question_id) a.question_id, a.level, a.correct
              from attempts a where a.learner_id = l.id
              order by a.question_id, a.answered_at desc, a.id desc
            ) x
            where x.correct
            group by x.level
          ) m), '{}'::json),
        'exams', coalesce((
          select json_agg(json_build_object('score', e.score, 'total', e.total, 'passed', e.passed, 'at', e.taken_at) order by e.taken_at)
          from exams e where e.learner_id = l.id), '[]'::json)
      ) order by l.display_name)
      from learners l where l.course_code = v_course.code), '[]'::json),
    'questions', coalesce((
      select json_agg(json_build_object('question_id', q.question_id, 'n', q.n, 'c', q.c))
      from (
        select a.question_id, count(*) as n, count(*) filter (where a.correct) as c
        from attempts a join learners l on l.id = a.learner_id
        where l.course_code = v_course.code
        group by a.question_id
      ) q), '[]'::json)
  );
end;
$$;

-- Konto löschen; falls die Rechte dafür fehlen, wenigstens sperren
create or replace function public._delete_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from learners where id = p_user;
  begin
    delete from auth.users where id = p_user;
  exception when others then
    update profiles set role = 'rejected', course_code = null where id = p_user;
  end;
end;
$$;

/* ---------------- Funktionen für alle angemeldeten Nutzer ---------------- */

create or replace function public.my_profile()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p profiles%rowtype;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then
    raise exception 'Kein Profil gefunden';
  end if;
  return json_build_object(
    'id', p.id, 'name', p.display_name, 'email', p.email, 'role', p.role,
    'course_code', p.course_code, 'course_name', (select name from courses where code = p.course_code),
    'requested_course', p.requested_course
  );
end;
$$;

create or replace function public.update_my_profile(p_name text, p_course text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 40);
begin
  if v_name = '' then
    raise exception 'Name fehlt';
  end if;
  update profiles
     set display_name = v_name,
         requested_course = case when role = 'pending' then nullif(upper(trim(coalesce(p_course, ''))), '') else requested_course end
   where id = auth.uid();
  update learners set display_name = v_name where id = auth.uid();
  return true;
end;
$$;

create or replace function public.record_my_progress(p_attempts jsonb, p_exams jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not exists (select 1 from learners where id = v_id) then
    raise exception 'Noch nicht freigegeben';
  end if;
  if jsonb_array_length(coalesce(p_attempts, '[]'::jsonb)) > 1000
     or jsonb_array_length(coalesce(p_exams, '[]'::jsonb)) > 100 then
    raise exception 'Zu viele Einträge auf einmal';
  end if;

  insert into attempts (learner_id, question_id, topic, level, correct, mode, answered_at)
  select v_id,
         left(a->>'question_id', 64),
         left(a->>'topic', 32),
         coalesce((a->>'level')::int, 0),
         coalesce((a->>'correct')::boolean, false),
         left(coalesce(a->>'mode', 'learn'), 16),
         least(coalesce((a->>'at')::timestamptz, now()), now())
  from jsonb_array_elements(coalesce(p_attempts, '[]'::jsonb)) as a;

  insert into exams (learner_id, score, total, passed, taken_at)
  select v_id,
         greatest((e->>'score')::int, 0),
         greatest((e->>'total')::int, 1),
         coalesce((e->>'passed')::boolean, false),
         least(coalesce((e->>'at')::timestamptz, now()), now())
  from jsonb_array_elements(coalesce(p_exams, '[]'::jsonb)) as e;

  update learners set last_seen = now() where id = v_id;
  return true;
end;
$$;

-- Eigener Lernverlauf – damit man auf einem neuen Gerät weitermachen kann
create or replace function public.my_history()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'attempts', coalesce((
      select json_agg(json_build_object('question_id', question_id, 'topic', topic, 'level', level, 'correct', correct, 'mode', mode, 'at', answered_at) order by answered_at, id)
      from attempts where learner_id = auth.uid()), '[]'::json),
    'exams', coalesce((
      select json_agg(json_build_object('score', score, 'total', total, 'passed', passed, 'at', taken_at) order by taken_at)
      from exams where learner_id = auth.uid()), '[]'::json)
  );
$$;

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  perform _delete_account(auth.uid());
  return true;
end;
$$;

/* ---------------- Funktionen für Ausbilder ---------------- */

create or replace function public.my_course_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return _course_stats(_instructor_course());
end;
$$;

create or replace function public.pending_registrations()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
begin
  return coalesce((
    select json_agg(json_build_object('id', id, 'name', display_name, 'email', email, 'requested_course', requested_course, 'created_at', created_at) order by created_at)
    from profiles
    where role = 'pending' and (requested_course = c or requested_course is null or requested_course not in (select code from courses))
  ), '[]'::json);
end;
$$;

create or replace function public.approve_registration(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
  v_name text;
begin
  update profiles set role = 'learner', course_code = c
   where id = p_user and role = 'pending'
  returning display_name into v_name;
  if not found then
    raise exception 'Anmeldung nicht gefunden';
  end if;
  insert into learners (id, course_code, display_name)
  values (p_user, c, coalesce(nullif(v_name, ''), 'Unbenannt'))
  on conflict (id) do update set course_code = excluded.course_code, display_name = excluded.display_name;
  return true;
end;
$$;

create or replace function public.reject_registration(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
begin
  if not exists (select 1 from profiles where id = p_user and role = 'pending'
                 and (requested_course = c or requested_course is null or requested_course not in (select code from courses))) then
    raise exception 'Anmeldung nicht gefunden';
  end if;
  perform _delete_account(p_user);
  return true;
end;
$$;

create or replace function public.remove_learner(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
begin
  if not exists (select 1 from profiles where id = p_user and role = 'learner' and course_code = c) then
    raise exception 'Teilnehmer nicht gefunden';
  end if;
  perform _delete_account(p_user);
  return true;
end;
$$;

-- Ausbilder setzt ein neues Passwort für Teilnehmende des eigenen Kurses
create or replace function public.learner_set_password(p_user uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c text := _instructor_course();
begin
  if not exists (select 1 from profiles where id = p_user and role in ('learner', 'pending') and (course_code = c or requested_course = c)) then
    raise exception 'Teilnehmer nicht gefunden';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Das Passwort muss mindestens 8 Zeichen haben';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  return true;
end;
$$;

/* ---------------- Rechte ---------------- */

revoke all on function public.handle_new_user()                 from public, anon, authenticated;
revoke all on function public._instructor_course()              from public, anon, authenticated;
revoke all on function public._course_stats(text)               from public, anon, authenticated;
revoke all on function public._delete_account(uuid)             from public, anon, authenticated;

revoke all on function public.my_profile()                      from public, anon;
revoke all on function public.update_my_profile(text, text)     from public, anon;
revoke all on function public.record_my_progress(jsonb, jsonb)  from public, anon;
revoke all on function public.my_history()                      from public, anon;
revoke all on function public.delete_my_account()               from public, anon;
revoke all on function public.my_course_stats()                 from public, anon;
revoke all on function public.pending_registrations()           from public, anon;
revoke all on function public.approve_registration(uuid)        from public, anon;
revoke all on function public.reject_registration(uuid)         from public, anon;
revoke all on function public.remove_learner(uuid)              from public, anon;
revoke all on function public.learner_set_password(uuid, text)  from public, anon;

grant execute on function public.my_profile()                      to authenticated;
grant execute on function public.update_my_profile(text, text)     to authenticated;
grant execute on function public.record_my_progress(jsonb, jsonb)  to authenticated;
grant execute on function public.my_history()                      to authenticated;
grant execute on function public.delete_my_account()               to authenticated;
grant execute on function public.my_course_stats()                 to authenticated;
grant execute on function public.pending_registrations()           to authenticated;
grant execute on function public.approve_registration(uuid)        to authenticated;
grant execute on function public.reject_registration(uuid)         to authenticated;
grant execute on function public.remove_learner(uuid)              to authenticated;
grant execute on function public.learner_set_password(uuid, text)  to authenticated;

-- Der alte Weg (Kurscode ohne Konto, Kurs-PIN) wird abgeschaltet
revoke execute on function public.join_course(text, uuid, text)       from anon, authenticated;
revoke execute on function public.record_progress(uuid, jsonb, jsonb) from anon, authenticated;
revoke execute on function public.course_stats(text, text)            from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Danach: dich selbst zum Ausbilder machen (erst in der App registrieren, dann):
--
-- update public.profiles set role = 'instructor', course_code = 'LOP-2026'
--  where email = 'deine@email.de';
--
-- Weitere Ausbilder genauso. Alte Testdaten aus der Zeit vor den Konten entfernen:
-- delete from public.learners where id not in (select id from public.profiles);
