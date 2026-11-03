-- Sani-Trainer – Update 1: Fortschritt pro Teilnehmer in der Ausbilder-Auswertung
-- Einmal im Supabase „SQL Editor“ ausführen (neue Abfrage → einfügen → Run).
-- Bestehende Daten bleiben erhalten.

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
        'last_seen', coalesce((select max(a.answered_at) from attempts a where a.learner_id = l.id), l.last_seen),
        'topics', coalesce((
          select json_object_agg(t.topic, json_build_object('n', t.n, 'c', t.c))
          from (
            select a.topic, count(*) as n, count(*) filter (where a.correct) as c
            from attempts a where a.learner_id = l.id group by a.topic
          ) t), '{}'::json),
        -- Fortschritt: Fragen je Stufe, deren letzte Antwort richtig war
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

revoke all on function public.course_stats(text, text) from public;
grant execute on function public.course_stats(text, text) to anon, authenticated;
