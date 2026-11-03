-- Sani-Trainer – Update 4: Ausbilder direkt in der App verwalten
-- Einmal im Supabase „SQL Editor“ ausführen (neue Abfrage → einfügen → Run).
-- Voraussetzung: update-3.sql wurde ausgeführt. Bestehende Daten bleiben erhalten.

-- Auswertung: Ausbilder erscheinen nicht mehr in der Teilnehmerliste
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
      from learners l where l.course_code = v_course.code
        and not exists (select 1 from profiles pi where pi.id = l.id and pi.role = 'instructor')), '[]'::json),
    'questions', coalesce((
      select json_agg(json_build_object('question_id', q.question_id, 'n', q.n, 'c', q.c))
      from (
        select a.question_id, count(*) as n, count(*) filter (where a.correct) as c
        from attempts a join learners l on l.id = a.learner_id
        where l.course_code = v_course.code
          and not exists (select 1 from profiles pi where pi.id = l.id and pi.role = 'instructor')
        group by a.question_id
      ) q), '[]'::json)
  );
end;
$$;

-- Ausbilder des eigenen Kurses
create or replace function public.course_instructors()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
begin
  return coalesce((
    select json_agg(json_build_object('id', id, 'name', display_name, 'email', email, 'me', id = auth.uid()) order by display_name)
    from profiles where role = 'instructor' and course_code = c
  ), '[]'::json);
end;
$$;

-- Neue Anmeldung direkt als Ausbilder freigeben
create or replace function public.approve_as_instructor(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
begin
  update profiles set role = 'instructor', course_code = c
   where id = p_user and role = 'pending'
     and (requested_course = c or requested_course is null or requested_course not in (select code from courses));
  if not found then
    raise exception 'Anmeldung nicht gefunden';
  end if;
  return true;
end;
$$;

-- Teilnehmer des eigenen Kurses zum Ausbilder machen (Lernverlauf bleibt erhalten)
create or replace function public.promote_to_instructor(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
begin
  update profiles set role = 'instructor'
   where id = p_user and role = 'learner' and course_code = c;
  if not found then
    raise exception 'Teilnehmer nicht gefunden';
  end if;
  return true;
end;
$$;

-- Ausbilder-Rechte entziehen (nicht bei sich selbst – so bleibt immer mindestens ein Ausbilder)
create or replace function public.demote_instructor(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := _instructor_course();
  v_name text;
begin
  if p_user = auth.uid() then
    raise exception 'Du kannst dir die Ausbilder-Rechte nicht selbst entziehen';
  end if;
  update profiles set role = 'learner'
   where id = p_user and role = 'instructor' and course_code = c
  returning display_name into v_name;
  if not found then
    raise exception 'Ausbilder nicht gefunden';
  end if;
  insert into learners (id, course_code, display_name)
  values (p_user, c, coalesce(nullif(v_name, ''), 'Unbenannt'))
  on conflict (id) do update set course_code = excluded.course_code;
  return true;
end;
$$;

revoke all on function public._course_stats(text)              from public, anon, authenticated;
revoke all on function public.course_instructors()             from public, anon;
revoke all on function public.approve_as_instructor(uuid)      from public, anon;
revoke all on function public.promote_to_instructor(uuid)      from public, anon;
revoke all on function public.demote_instructor(uuid)          from public, anon;
grant execute on function public.course_instructors()          to authenticated;
grant execute on function public.approve_as_instructor(uuid)   to authenticated;
grant execute on function public.promote_to_instructor(uuid)   to authenticated;
grant execute on function public.demote_instructor(uuid)       to authenticated;
