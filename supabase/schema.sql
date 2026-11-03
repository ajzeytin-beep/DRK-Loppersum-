-- Sani-Trainer – Datenbank für die Ausbilder-Auswertung (Supabase / PostgreSQL)
-- Einmal komplett im Supabase „SQL Editor“ ausführen.
--
-- Sicherheitsprinzip: Die Tabellen sind per Row Level Security für den öffentlichen
-- Schlüssel (anon) komplett gesperrt. Zugriff gibt es nur über die drei Funktionen unten:
--   join_course     – Teilnehmende treten mit Kurscode einem Kurs bei
--   record_progress – Teilnehmende übertragen ihre Antworten
--   course_stats    – Ausbilder lesen die Auswertung, nur mit Kurscode + PIN

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.courses (
  code                text primary key,
  name                text not null,
  instructor_pin_hash text not null,
  created_at          timestamptz not null default now()
);

create table if not exists public.learners (
  id           uuid primary key,
  course_code  text not null references public.courses(code) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

create table if not exists public.attempts (
  id          bigint generated always as identity primary key,
  learner_id  uuid not null references public.learners(id) on delete cascade,
  question_id text not null,
  topic       text not null,
  level       int  not null,
  correct     boolean not null,
  mode        text not null,
  answered_at timestamptz not null
);
create index if not exists attempts_learner_idx on public.attempts(learner_id);

create table if not exists public.exams (
  id         bigint generated always as identity primary key,
  learner_id uuid not null references public.learners(id) on delete cascade,
  score      int not null,
  total      int not null,
  passed     boolean not null,
  taken_at   timestamptz not null
);
create index if not exists exams_learner_idx on public.exams(learner_id);

alter table public.courses  enable row level security;
alter table public.learners enable row level security;
alter table public.attempts enable row level security;
alter table public.exams    enable row level security;
-- Bewusst KEINE Policies: direkter Tabellenzugriff ist für anon/authenticated gesperrt.

-- Teilnehmende treten einem Kurs bei (oder ändern ihren Anzeigenamen).
create or replace function public.join_course(p_code text, p_learner_id uuid, p_name text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(trim(p_code));
  v_name text;
begin
  select name into v_name from courses where code = v_code;
  if v_name is null then
    raise exception 'Kurscode unbekannt';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name fehlt';
  end if;
  insert into learners (id, course_code, display_name)
  values (p_learner_id, v_code, left(trim(p_name), 40))
  on conflict (id) do update
    set display_name = excluded.display_name,
        course_code  = excluded.course_code,
        last_seen    = now();
  return json_build_object('code', v_code, 'name', v_name);
end;
$$;

-- Antworten und Prüfungsergebnisse übertragen (max. 1000 Einträge pro Aufruf).
create or replace function public.record_progress(p_learner_id uuid, p_attempts jsonb, p_exams jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from learners where id = p_learner_id) then
    raise exception 'Teilnehmer unbekannt – bitte erneut dem Kurs beitreten';
  end if;
  if jsonb_array_length(coalesce(p_attempts, '[]'::jsonb)) > 1000
     or jsonb_array_length(coalesce(p_exams, '[]'::jsonb)) > 100 then
    raise exception 'Zu viele Einträge auf einmal';
  end if;

  insert into attempts (learner_id, question_id, topic, level, correct, mode, answered_at)
  select p_learner_id,
         left(a->>'question_id', 64),
         left(a->>'topic', 32),
         coalesce((a->>'level')::int, 0),
         coalesce((a->>'correct')::boolean, false),
         left(coalesce(a->>'mode', 'learn'), 16),
         least(coalesce((a->>'at')::timestamptz, now()), now())
  from jsonb_array_elements(coalesce(p_attempts, '[]'::jsonb)) as a;

  insert into exams (learner_id, score, total, passed, taken_at)
  select p_learner_id,
         greatest((e->>'score')::int, 0),
         greatest((e->>'total')::int, 1),
         coalesce((e->>'passed')::boolean, false),
         least(coalesce((e->>'at')::timestamptz, now()), now())
  from jsonb_array_elements(coalesce(p_exams, '[]'::jsonb)) as e;

  update learners set last_seen = now() where id = p_learner_id;
  return true;
end;
$$;

-- Auswertung für Ausbilder: nur mit korrektem Kurscode + PIN.
create or replace function public.course_stats(p_code text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_course courses%rowtype;
begin
  select * into v_course from courses where code = upper(trim(p_code));
  if v_course.code is null or v_course.instructor_pin_hash <> crypt(p_pin, v_course.instructor_pin_hash) then
    perform pg_sleep(1);  -- bremst Durchprobieren von PINs
    raise exception 'Kurscode oder PIN falsch';
  end if;

  return json_build_object(
    'course', json_build_object('code', v_course.code, 'name', v_course.name),
    'learners', coalesce((
      select json_agg(json_build_object(
        'id', l.id,
        'name', l.display_name,
        'last_seen', l.last_seen,
        'topics', coalesce((
          select json_object_agg(t.topic, json_build_object('n', t.n, 'c', t.c))
          from (
            select a.topic, count(*) as n, count(*) filter (where a.correct) as c
            from attempts a where a.learner_id = l.id group by a.topic
          ) t), '{}'::json),
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

revoke all on function public.join_course(text, uuid, text)        from public;
revoke all on function public.record_progress(uuid, jsonb, jsonb)  from public;
revoke all on function public.course_stats(text, text)             from public;
grant execute on function public.join_course(text, uuid, text)       to anon, authenticated;
grant execute on function public.record_progress(uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.course_stats(text, text)            to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Einen Kurs anlegen (Code und PIN anpassen, PIN geheim halten!):
--
-- insert into public.courses (code, name, instructor_pin_hash)
-- values ('LOP-2026', 'Sanitätslehrgang OV Loppersum 2026', extensions.crypt('HIER-SICHERE-PIN', extensions.gen_salt('bf')));
--
-- Kurs nach dem Lehrgang inkl. aller Daten löschen (Datensparsamkeit):
-- delete from public.courses where code = 'LOP-2026';
