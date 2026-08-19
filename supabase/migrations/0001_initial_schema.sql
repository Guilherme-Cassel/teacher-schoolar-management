-- ============================================================================
-- Gestão Escolar — schema inicial
-- Aplicar no projeto Supabase PESSOAL (SQL Editor ou `supabase db push`).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----
create type member_role        as enum ('teacher','coordinator','admin');
create type term_status        as enum ('planned','open','closed');
create type enrollment_status  as enum ('active','transferred','dropped');
create type grading_method     as enum ('arithmetic','weighted','points_sum');
create type recovery_formula   as enum ('replace','average');
create type occurrence_type    as enum ('praise','criticism');
create type academic_status    as enum ('approved','recovery','failed','council_approved');
create type closure_suggestion as enum ('none','adjust','keep','free_choice');

-- ============================================================== instituição ==
create table schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  timezone   text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

create table school_members (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         member_role not null default 'teacher',
  display_name text,
  created_at   timestamptz not null default now(),
  unique (school_id, user_id)
);

-- Helper de RLS. SECURITY DEFINER evita recursão ao ler school_members.
create or replace function public.is_school_member(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.school_members m
    where m.school_id = p_school_id and m.user_id = auth.uid()
  );
$fn$;

create table school_years (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id) on delete cascade,
  year           int  not null,
  starts_on      date,
  ends_on        date,
  is_current     boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (school_id, year),
  unique (id, school_id)          -- habilita FK composta nos filhos
);

create table terms (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null,
  school_year_id uuid not null,
  name           text not null,               -- "1º Bimestre"
  position       int  not null,
  starts_on      date,
  ends_on        date,
  status         term_status not null default 'planned',
  created_at     timestamptz not null default now(),
  foreign key (school_year_id, school_id) references school_years(id, school_id) on delete cascade,
  unique (school_year_id, position),
  unique (id, school_id)
);

create table subjects (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name      text not null,
  code      text,
  unique (school_id, name),
  unique (id, school_id)
);

create table classes (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null,
  school_year_id uuid not null,
  name           text not null,               -- "9º A"
  shift          text,                        -- manhã / tarde / noite
  foreign key (school_year_id, school_id) references school_years(id, school_id) on delete cascade,
  unique (school_year_id, name),
  unique (id, school_id)
);

-- A "oferta": esta disciplina, nesta turma, com esta professora.
create table class_subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null,
  class_id   uuid not null,
  subject_id uuid not null,
  teacher_id uuid references auth.users(id) on delete set null,
  foreign key (class_id,   school_id) references classes(id,  school_id) on delete cascade,
  foreign key (subject_id, school_id) references subjects(id, school_id) on delete cascade,
  unique (class_id, subject_id),
  unique (id, school_id)
);

-- =================================================================== alunos ==
create table students (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  full_name         text not null,
  registration_code text,
  birth_date        date,
  guardian_name     text,
  guardian_contact  text,
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (school_id, registration_code),
  unique (id, school_id)
);

create table enrollments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null,
  student_id  uuid not null,
  class_id    uuid not null,
  status      enrollment_status not null default 'active',
  enrolled_on date not null default current_date,
  left_on     date,
  foreign key (student_id, school_id) references students(id, school_id) on delete cascade,
  foreign key (class_id,   school_id) references classes(id,  school_id) on delete cascade,
  unique (student_id, class_id)
);

-- =============================================================== avaliação ==
-- class_subject_id NULL = configuração padrão da escola.
create table grading_configs (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references schools(id) on delete cascade,
  class_subject_id       uuid,
  passing_grade          numeric(5,2) not null default 6.00,
  max_grade              numeric(5,2) not null default 10.00,
  method                 grading_method not null default 'weighted',
  decimal_places         int not null default 1 check (decimal_places between 0 and 3),
  has_recovery           boolean not null default false,
  recovery_passing_grade numeric(5,2) default 6.00,
  recovery_formula       recovery_formula default 'replace',
  min_attendance_pct     numeric(5,2) not null default 75.00,
  -- Motor de sugestão:
  adjust_tolerance       numeric(5,2) not null default 0.50,  -- gap máximo p/ considerar ajuste
  conduct_threshold      int not null default 1,              -- saldo mínimo p/ sugerir ajuste
  foreign key (class_subject_id, school_id) references class_subjects(id, school_id) on delete cascade
);
create unique index grading_configs_school_default_uniq
  on grading_configs (school_id) where class_subject_id is null;
create unique index grading_configs_class_subject_uniq
  on grading_configs (class_subject_id) where class_subject_id is not null;

create table assessments (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null,
  class_subject_id uuid not null,
  term_id          uuid not null,
  name             text not null,                 -- "Prova 1"
  kind             text not null default 'prova', -- prova / trabalho / participação
  weight           numeric(6,2) not null default 1 check (weight > 0),
  max_score        numeric(5,2) not null default 10 check (max_score > 0),
  due_date         date,
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  foreign key (class_subject_id, school_id) references class_subjects(id, school_id) on delete cascade,
  foreign key (term_id,          school_id) references terms(id,          school_id) on delete cascade,
  unique (id, school_id)
);

create table grades (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  assessment_id uuid not null,
  student_id    uuid not null,
  score         numeric(6,2) check (score >= 0),
  is_absent     boolean not null default false,
  note          text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  foreign key (assessment_id, school_id) references assessments(id, school_id) on delete cascade,
  foreign key (student_id,    school_id) references students(id,    school_id) on delete cascade,
  unique (assessment_id, student_id)
);

-- Frequência agregada por período (diário aula a aula fica p/ versão futura).
create table term_attendance (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null,
  student_id       uuid not null,
  class_subject_id uuid not null,
  term_id          uuid not null,
  classes_held     int not null default 0 check (classes_held >= 0),
  absences         int not null default 0 check (absences >= 0),
  foreign key (student_id,       school_id) references students(id,       school_id) on delete cascade,
  foreign key (class_subject_id, school_id) references class_subjects(id, school_id) on delete cascade,
  foreign key (term_id,          school_id) references terms(id,          school_id) on delete cascade,
  unique (student_id, class_subject_id, term_id),
  check (absences <= classes_held)
);

-- ================================================================= conduta ==
create table occurrences (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null,
  student_id       uuid not null,
  term_id          uuid not null,
  class_subject_id uuid,
  type             occurrence_type not null,
  category         text not null,     -- participação, indisciplina, entrega de tarefa...
  severity         smallint not null default 1 check (severity between 1 and 3),
  description      text,
  occurred_on      date not null default current_date,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  foreign key (student_id,       school_id) references students(id,       school_id) on delete cascade,
  foreign key (term_id,          school_id) references terms(id,          school_id) on delete cascade,
  foreign key (class_subject_id, school_id) references class_subjects(id, school_id) on delete cascade
);

-- ============================================================== fechamento ==
-- calculated_average NUNCA é sobrescrita. O ajuste vive em final_grade +
-- justification + decided_by + decided_at. Isso é a trilha de auditoria.
create table term_closures (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  student_id         uuid not null,
  class_subject_id   uuid not null,
  term_id            uuid not null,
  calculated_average numeric(6,2) not null,
  conduct_score      int not null default 0,
  conduct_band       text not null,
  attendance_pct     numeric(5,2),
  calculated_status  academic_status not null,
  system_suggestion  closure_suggestion not null default 'none',
  final_grade        numeric(6,2) not null,
  was_adjusted       boolean not null default false,
  justification      text,
  decided_by         uuid references auth.users(id),
  decided_at         timestamptz not null default now(),
  foreign key (student_id,       school_id) references students(id,       school_id) on delete cascade,
  foreign key (class_subject_id, school_id) references class_subjects(id, school_id) on delete cascade,
  foreign key (term_id,          school_id) references terms(id,          school_id) on delete cascade,
  unique (student_id, class_subject_id, term_id),
  -- Ajustar sem justificativa é impossível — garantido pelo banco.
  constraint term_closures_adjustment_needs_reason
    check (was_adjusted = false or (justification is not null and length(btrim(justification)) >= 10))
);

create table final_results (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null,
  student_id       uuid not null,
  class_subject_id uuid not null,
  school_year_id   uuid not null,
  annual_average   numeric(6,2),
  attendance_pct   numeric(5,2),
  status           academic_status not null,
  notes            text,
  closed_by        uuid references auth.users(id),
  closed_at        timestamptz not null default now(),
  foreign key (student_id,       school_id) references students(id,       school_id) on delete cascade,
  foreign key (class_subject_id, school_id) references class_subjects(id, school_id) on delete cascade,
  foreign key (school_year_id,   school_id) references school_years(id,   school_id) on delete cascade,
  unique (student_id, class_subject_id, school_year_id)
);

-- ================================================================= índices ==
create index on school_members  (user_id);
create index on terms           (school_year_id, status);
create index on classes         (school_year_id);
create index on class_subjects  (class_id);
create index on class_subjects  (teacher_id);
create index on enrollments     (class_id, status);
create index on enrollments     (student_id);
create index on students        (school_id, is_active);
create index on assessments     (class_subject_id, term_id, position);
create index on grades          (student_id);
create index on occurrences     (student_id, term_id);
create index on occurrences     (term_id, occurred_on desc);
create index on term_closures   (class_subject_id, term_id);
create index on term_attendance (class_subject_id, term_id);

-- ================================================================ triggers ==
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

create trigger grades_touch_updated_at
  before update on grades for each row execute function public.touch_updated_at();

-- Período fechado trava lançamento. Reabrir o período é uma ação explícita
-- (mudar terms.status para 'open'), que fica registrada na própria linha.
create or replace function public.assert_term_open()
returns trigger language plpgsql as $fn$
declare
  v_row     record;
  v_term_id uuid;
  v_status  term_status;
  v_name    text;
begin
  -- OLD só existe em DELETE e NEW só em INSERT/UPDATE: escolher a linha certa
  -- antes de ler qualquer campo evita "record is not assigned yet".
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if tg_table_name = 'grades' then
    select a.term_id into v_term_id from assessments a where a.id = v_row.assessment_id;
  else
    v_term_id := v_row.term_id;
  end if;

  select t.status, t.name into v_status, v_name from terms t where t.id = v_term_id;

  if v_status = 'closed' then
    raise exception 'O período "%" está fechado. Reabra-o para alterar lançamentos.', v_name
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $fn$;

create trigger grades_term_must_be_open
  before insert or update or delete on grades
  for each row execute function public.assert_term_open();

create trigger occurrences_term_must_be_open
  before insert or update or delete on occurrences
  for each row execute function public.assert_term_open();

-- =================================================================== views ==
-- Saldo de conduta por aluno/período — usado na tela de Fechamento.
create view v_student_term_conduct with (security_invoker = on) as
  select
    school_id,
    student_id,
    term_id,
    sum(case when type = 'praise' then severity else -severity end)::int as conduct_score,
    count(*) filter (where type = 'praise')    ::int as praise_count,
    count(*) filter (where type = 'criticism') ::int as criticism_count,
    count(*)                                   ::int as total_count
  from occurrences
  group by school_id, student_id, term_id;

-- ===================================================================== RLS ==
alter table schools        enable row level security;
alter table school_members enable row level security;

create policy schools_member_select on schools
  for select to authenticated using (public.is_school_member(id));
create policy schools_admin_write on schools
  for update to authenticated using (public.is_school_member(id));

create policy members_read_own_schools on school_members
  for select to authenticated using (user_id = auth.uid() or public.is_school_member(school_id));
create policy members_admin_manage on school_members
  for all to authenticated
  using (public.is_school_member(school_id))
  with check (public.is_school_member(school_id));

-- Toda tabela de domínio segue a mesma regra: você enxerga a sua escola.
do $do$
declare t text;
begin
  foreach t in array array[
    'school_years','terms','subjects','classes','class_subjects',
    'students','enrollments','grading_configs','assessments','grades',
    'term_attendance','occurrences','term_closures','final_results'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_school_member(school_id))
         with check (public.is_school_member(school_id))',
      t || '_school_access', t);
  end loop;
end $do$;

-- ================================================================= grants ==
-- A view herda o RLS das tabelas de origem (security_invoker), mas ainda
-- precisa da permissão de leitura para os papéis do Supabase.
grant select on public.v_student_term_conduct to authenticated;
grant execute on function public.is_school_member(uuid) to authenticated;
