-- Sani-Trainer – Update 3: Einträge ohne Konto entfernen, fehlende Profile automatisch anlegen
-- Einmal im Supabase „SQL Editor“ ausführen (neue Abfrage → einfügen → Run).
-- Voraussetzung: update-2.sql wurde ausgeführt. Bestehende Daten bleiben erhalten.

-- Auswertung: zusätzlich kennzeichnen, ob ein Eintrag zu einem Konto gehört
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
        'account', exists (select 1 from profiles p where p.id = l.id),
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

-- Entfernen: Konten des eigenen Kurses löschen – und alte Einträge ohne Konto (aus der Zeit vor Update 2)
create or replace function public.remove_learner(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
begin
  if exists (select 1 from profiles where id = p_user and role = 'learner' and course_code = c) then
    perform _delete_account(p_user);
  elsif exists (select 1 from learners where id = p_user and course_code = c)
        and not exists (select 1 from profiles where id = p_user) then
    delete from learners where id = p_user;
  else
    raise exception 'Teilnehmer nicht gefunden';
  end if;
  return true;
end;
$$;

-- Eigenes Profil: fehlt es (z. B. Konto vor Update 2 angelegt), wird es automatisch nachgetragen
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
    insert into profiles (id, display_name, email, requested_course)
    select u.id,
           left(coalesce(trim(u.raw_user_meta_data->>'name'), ''), 40),
           u.email,
           nullif(upper(trim(coalesce(u.raw_user_meta_data->>'course', ''))), '')
      from auth.users u
     where u.id = auth.uid()
    on conflict (id) do nothing;
    select * into p from profiles where id = auth.uid();
  end if;
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

revoke all on function public._course_stats(text)      from public, anon, authenticated;
revoke all on function public.remove_learner(uuid)     from public, anon;
revoke all on function public.my_profile()             from public, anon;
grant execute on function public.remove_learner(uuid)  to authenticated;
grant execute on function public.my_profile()          to authenticated;
