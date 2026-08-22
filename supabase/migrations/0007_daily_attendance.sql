-- ============================================================================
-- Chamada diária.
--
-- Até aqui a frequência era um total por período: a professora digitava "23
-- faltas em 80 aulas". Para saber que eram 23, ela contava em outro lugar —
-- exatamente o buraco por onde a planilha sobrevivia.
--
-- Duas tabelas novas: `lessons` é o dia de aula (com quantas aulas foram
-- dadas), e `lesson_absences` guarda SÓ quem faltou. Guardar ausência em vez
-- de presença é o que mantém a tabela pequena: numa turma de 30, o normal é
-- zero a três linhas por dia.
--
-- `term_attendance` continua existindo e continua sendo a fonte que o
-- Fechamento, o Boletim e o resultado anual leem. Ela passa a ser recalculada
-- por trigger a partir das aulas. Assim a chamada diária entra sem que
-- nenhuma linha do código de cálculo precise mudar — e a importação histórica,
-- que escreve totais direto, continua valendo.
-- ============================================================================

create table lessons (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null,
  class_subject_id uuid not null,
  term_id          uuid not null,
  lesson_date      date not null,
  -- Aula dupla conta como duas: quem falta perde as duas.
  periods          int not null default 1 check (periods between 1 and 10),
  topic            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  foreign key (class_subject_id, school_id) references class_subjects(id, school_id) on delete cascade,
  foreign key (term_id,          school_id) references terms(id,          school_id) on delete cascade,
  -- Uma chamada por dia por disciplina. Registrar o mesmo dia duas vezes
  -- dobraria o total de aulas sem ninguém perceber.
  unique (class_subject_id, lesson_date),
  unique (id, school_id)
);

create table lesson_absences (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null,
  lesson_id  uuid not null,
  student_id uuid not null,
  -- Falta justificada continua sendo falta na conta de frequência; o campo
  -- serve para a professora lembrar do contexto na hora do fechamento.
  justified  boolean not null default false,
  note       text,
  created_at timestamptz not null default now(),
  foreign key (lesson_id,  school_id) references lessons(id,  school_id) on delete cascade,
  foreign key (student_id, school_id) references students(id, school_id) on delete cascade,
  unique (lesson_id, student_id)
);

create index on lessons         (class_subject_id, term_id, lesson_date);
create index on lesson_absences (student_id);
create index on lesson_absences (lesson_id);

-- ----------------------------------------------------------------------------
-- Recalcula o total do período a partir das aulas registradas.
-- ----------------------------------------------------------------------------
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
  'Reescreve term_attendance a partir de lessons/lesson_absences. Não faz nada '
  'quando não há aulas registradas, para não apagar totais importados.';

-- ----------------------------------------------------------------------------
-- Trigger que dispara o recálculo em qualquer mudança de aula ou de falta.
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
    -- lesson_absences não sabe a que oferta pertence: descobre pela aula.
    -- OLD e NEW não coexistem, então a leitura precisa saber a operação.
    if tg_op = 'DELETE' then
      select l.class_subject_id, l.term_id into v_class_subject_id, v_term_id
        from lessons l where l.id = old.lesson_id;
    else
      select l.class_subject_id, l.term_id into v_class_subject_id, v_term_id
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

-- AFTER, não BEFORE: o recálculo precisa enxergar a linha já gravada.
create trigger lessons_sync_attendance
  after insert or update or delete on lessons
  for each row execute function public.trg_recompute_term_attendance();

create trigger lesson_absences_sync_attendance
  after insert or update or delete on lesson_absences
  for each row execute function public.trg_recompute_term_attendance();

-- =================================================================== RLS ===
do $do$
declare t text;
begin
  foreach t in array array['lessons','lesson_absences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_school_member(school_id))
         with check (public.is_school_member(school_id))',
      t || '_school_access', t);
  end loop;
end $do$;

grant execute on function public.recompute_term_attendance(uuid, uuid) to authenticated;
