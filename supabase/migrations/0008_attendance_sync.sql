-- ============================================================================
-- Chamada diária — parte 2 de 2: recálculo do total do período.
--
-- Rodar DEPOIS da 0007, que cria as tabelas que estas funções leem.
--
-- `term_attendance` continua sendo a fonte que o Fechamento, o Boletim e o
-- resultado anual leem. Ela passa a ser recalculada a partir das aulas, o que
-- deixou a chamada diária entrar sem que nenhuma linha do código de cálculo
-- precisasse mudar — e sem quebrar a importação histórica, que escreve totais
-- direto na tabela.
--
-- Este arquivo é separado da 0007 de propósito: o SQL Editor do Supabase
-- injeta comandos de RLS quando vê CREATE TABLE e, ao fazer isso, corta no
-- primeiro ';' que encontra — inclusive dentro de um corpo $fn$...$fn$, que
-- ele não sabe interpretar. Sem CREATE TABLE aqui, o assistente não acorda.
--
-- Seguro de rodar mais de uma vez.
-- ============================================================================

create or replace function public.recompute_term_attendance(
  p_class_subject_id uuid,
  p_term_id          uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_school_id uuid;
  v_class_id  uuid;
  v_held      int;
begin
  select cs.school_id, cs.class_id
    into v_school_id, v_class_id
    from class_subjects cs
   where cs.id = p_class_subject_id;

  if v_school_id is null then return; end if;

  select coalesce(sum(l.periods), 0) into v_held
    from lessons l
   where l.class_subject_id = p_class_subject_id
     and l.term_id = p_term_id;

  -- Nenhuma aula registrada = chamada diária não está em uso neste período.
  -- Sair aqui preserva o total que veio da importação ou da digitação manual;
  -- zerar seria apagar dado que ninguém pediu para apagar.
  if v_held = 0 then return; end if;

  insert into term_attendance (
    school_id, student_id, class_subject_id, term_id, classes_held, absences
  )
  select
    v_school_id,
    e.student_id,
    p_class_subject_id,
    p_term_id,
    v_held,
    coalesce((
      select sum(l2.periods)
        from lesson_absences la
        join lessons l2 on l2.id = la.lesson_id
       where la.student_id = e.student_id
         and l2.class_subject_id = p_class_subject_id
         and l2.term_id = p_term_id
    ), 0)
  from enrollments e
  where e.class_id = v_class_id
    and e.status = 'active'
  on conflict (student_id, class_subject_id, term_id) do update
    set classes_held = excluded.classes_held,
        absences     = excluded.absences;
end
$fn$;

comment on function public.recompute_term_attendance(uuid, uuid) is
  'Reescreve term_attendance a partir de lessons/lesson_absences. Nao faz nada '
  'quando nao ha aulas registradas, para nao apagar totais importados.';

-- ----------------------------------------------------------------------------

create or replace function public.trg_recompute_term_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class_subject_id uuid;
  v_term_id          uuid;
begin
  if tg_table_name = 'lessons' then
    if tg_op = 'DELETE' then
      v_class_subject_id := old.class_subject_id;
      v_term_id          := old.term_id;
    else
      v_class_subject_id := new.class_subject_id;
      v_term_id          := new.term_id;
    end if;
  else
    -- lesson_absences nao sabe a que oferta pertence: descobre pela aula.
    -- OLD e NEW nao coexistem, entao a leitura precisa saber a operacao.
    if tg_op = 'DELETE' then
      select l.class_subject_id, l.term_id
        into v_class_subject_id, v_term_id
        from lessons l where l.id = old.lesson_id;
    else
      select l.class_subject_id, l.term_id
        into v_class_subject_id, v_term_id
        from lessons l where l.id = new.lesson_id;
    end if;
  end if;

  if v_class_subject_id is not null then
    perform public.recompute_term_attendance(v_class_subject_id, v_term_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$fn$;

-- AFTER, nao BEFORE: o recalculo precisa enxergar a linha ja gravada.
drop trigger if exists lessons_sync_attendance on lessons;
create trigger lessons_sync_attendance
  after insert or update or delete on lessons
  for each row execute function public.trg_recompute_term_attendance();

drop trigger if exists lesson_absences_sync_attendance on lesson_absences;
create trigger lesson_absences_sync_attendance
  after insert or update or delete on lesson_absences
  for each row execute function public.trg_recompute_term_attendance();

grant execute on function public.recompute_term_attendance(uuid, uuid) to authenticated;
