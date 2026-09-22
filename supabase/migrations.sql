-- ============================================================================
-- Gestão Escolar — schema completo, consolidado
--
-- Este arquivo junta, na ordem correta, todas as migrations de
-- supabase/migrations/. Cole no SQL Editor do seu projeto Supabase e
-- clique em Run uma única vez para recriar o banco do zero.
--
-- Prefere aplicar passo a passo (ou já tem um banco parcialmente criado)?
-- Use os arquivos numerados em supabase/migrations/ um de cada vez, na
-- ordem do nome. Este arquivo é gerado a partir deles e não deve ser
-- editado diretamente — edite a migration correspondente e regenere.
-- ============================================================================


-- ---------------------------------------------------------------------
-- 0001_initial_schema.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 0002_health_check.sql
-- ---------------------------------------------------------------------

-- ============================================================================
-- health_check() — usada pelo cron diário para manter o projeto Supabase ativo.
--
-- O plano gratuito pausa o projeto após ~7 dias sem atividade. Uma consulta
-- por dia evita isso. A função toca uma tabela real (e não apenas now()) para
-- que a chamada conte como atividade de banco, mas não devolve nenhum dado.
-- ============================================================================

create or replace function public.health_check()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ignorado int;
begin
  select count(*) into v_ignorado from schools;
  return json_build_object('ok', true, 'at', now());
end
$fn$;

comment on function public.health_check() is
  'Ping de atividade. Não expõe dados: devolve apenas ok e o horário do banco.';

grant execute on function public.health_check() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 0003_annual_indexes.sql
-- ---------------------------------------------------------------------

-- ============================================================================
-- Índices para o fechamento anual.
--
-- A unique (student_id, class_subject_id, school_year_id) já existente só
-- ajuda quando a consulta parte do aluno. A tela do ano parte da oferta e do
-- ano letivo, então precisa do índice na outra ordem.
-- ============================================================================

create index if not exists final_results_offer_year_idx
  on final_results (class_subject_id, school_year_id);

create index if not exists term_closures_offer_student_idx
  on term_closures (class_subject_id, student_id);


-- ---------------------------------------------------------------------
-- 0004_school_provisioning.sql
-- ---------------------------------------------------------------------

-- ============================================================================
-- Criação de escola self-service (Fase A).
--
-- Por que uma função e não uma policy de INSERT em `schools`:
-- criar uma escola e virar membro dela são duas escritas que precisam
-- acontecer juntas. Uma policy de INSERT em `schools` não resolve sozinha —
-- logo após inserir a escola o usuário ainda NÃO é membro, então o INSERT em
-- `school_members` bateria em is_school_member() = false e seria recusado.
-- Abrir a policy de school_members para esse caso deixaria qualquer usuário
-- se auto-vincular a QUALQUER escola existente, o que fura o isolamento entre
-- ambientes. A função abaixo faz as duas escritas numa transação só, e o único
-- vínculo que ela cria é entre a escola nova e quem a está criando.
-- ============================================================================

create or replace function public.create_school_with_owner(
  p_name     text,
  p_timezone text default 'America/Sao_Paulo'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id   uuid := auth.uid();
  v_school_id uuid;
  v_name      text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception 'Sessão expirada. Entre novamente.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_name is null or length(v_name) < 2 then
    raise exception 'O nome da escola precisa ter pelo menos 2 caracteres.'
      using errcode = 'check_violation';
  end if;

  -- Um mesmo usuário não deve acabar com dois ambientes de mesmo nome: quase
  -- sempre é duplo clique ou uma segunda tentativa após erro de rede, e dois
  -- ambientes idênticos no seletor são impossíveis de distinguir depois.
  if exists (
    select 1
      from school_members m
      join schools s on s.id = m.school_id
     where m.user_id = v_user_id
       and lower(btrim(s.name)) = lower(v_name)
  ) then
    raise exception 'Você já tem um ambiente chamado "%".', v_name
      using errcode = 'unique_violation';
  end if;

  insert into schools (name, timezone)
  values (v_name, coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo'))
  returning id into v_school_id;

  -- Quem cria o ambiente o administra: é ela quem vai cadastrar turmas,
  -- disciplinas e (no futuro) convidar outras professoras.
  insert into school_members (school_id, user_id, role)
  values (v_school_id, v_user_id, 'admin');

  return v_school_id;
end
$fn$;

comment on function public.create_school_with_owner(text, text) is
  'Cria uma escola e vincula quem chamou como admin, numa transação só. '
  'Único caminho permitido para criar ambiente — schools não tem policy de INSERT.';

grant execute on function public.create_school_with_owner(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 0005_historical_import.sql
-- ---------------------------------------------------------------------

-- ============================================================================
-- Importação de notas históricas (Fase D).
--
-- O problema: o trigger assert_term_open recusa qualquer escrita em `grades`
-- quando o período está 'closed'. Isso está certo para o uso do dia a dia —
-- é o que impede alterar nota de um bimestre já encerrado sem reabri-lo.
--
-- Mas a importação traz justamente o passado: bimestres que já aconteceram e
-- que, ao serem cadastrados no sistema, vão estar fechados. Sem uma exceção,
-- a professora teria que reabrir todos os períodos, importar e fechar de
-- novo — e um período reaberto por engano vira lançamento indevido depois.
--
-- A exceção é uma flag de transação (`app.importing`) que só a função abaixo
-- consegue ligar, porque ela é SECURITY DEFINER e set_config com escopo local
-- morre no fim da transação. Não dá para ligá-la pela API REST nem por uma
-- escrita solta de UI: o único caminho é chamar import_historical_grades.
--
-- Como SECURITY DEFINER passa por cima do RLS, a checagem de escola é feita
-- à mão aqui dentro. Ela é a única coisa que separa esta função de um buraco
-- por onde qualquer usuário escreveria em qualquer escola.
-- ============================================================================

create or replace function public.assert_term_open()
returns trigger language plpgsql as $fn$
declare
  v_row     record;
  v_term_id uuid;
  v_status  term_status;
  v_name    text;
begin
  -- Importação histórica: a exceção é ligada por import_historical_grades e
  -- só vale dentro daquela transação.
  if coalesce(current_setting('app.importing', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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

-- ----------------------------------------------------------------------------

create or replace function public.import_historical_grades(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_count   integer := 0;
  v_bad     integer;
begin
  if v_user_id is null then
    raise exception 'Sessão expirada. Entre novamente.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Payload de importação inválido.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Toda avaliação citada tem que pertencer a uma escola de que quem chamou
  -- é membro. Uma linha fora disso derruba a importação inteira: importar
  -- "quase tudo" deixaria a professora sem saber o que entrou.
  select count(*) into v_bad
    from jsonb_to_recordset(p_rows) as r(assessment_id uuid, student_id uuid)
    left join assessments a on a.id = r.assessment_id
   where a.id is null
      or not public.is_school_member(a.school_id);

  if v_bad > 0 then
    raise exception 'Importação recusada: % avaliação(ões) fora dos seus ambientes.', v_bad
      using errcode = 'insufficient_privilege';
  end if;

  -- Mesma checagem para o aluno, e ele precisa ser da MESMA escola da
  -- avaliação — senão daria para colar a nota de um aluno de outra escola.
  select count(*) into v_bad
    from jsonb_to_recordset(p_rows) as r(assessment_id uuid, student_id uuid)
    join assessments a on a.id = r.assessment_id
    left join students s on s.id = r.student_id
   where s.id is null
      or s.school_id <> a.school_id;

  if v_bad > 0 then
    raise exception 'Importação recusada: % aluno(s) fora do ambiente da avaliação.', v_bad
      using errcode = 'insufficient_privilege';
  end if;

  -- Daqui para baixo o trigger de período fechado fica suspenso.
  perform set_config('app.importing', 'on', true);

  insert into grades (school_id, assessment_id, student_id, score, is_absent, updated_by)
  select a.school_id, r.assessment_id, r.student_id, r.score, coalesce(r.is_absent, false), v_user_id
    from jsonb_to_recordset(p_rows)
      as r(assessment_id uuid, student_id uuid, score numeric, is_absent boolean)
    join assessments a on a.id = r.assessment_id
  on conflict (assessment_id, student_id) do update
    set score      = excluded.score,
        is_absent  = excluded.is_absent,
        updated_by = excluded.updated_by;

  get diagnostics v_count = row_count;

  perform set_config('app.importing', 'off', true);

  return v_count;
end
$fn$;

comment on function public.import_historical_grades(jsonb) is
  'Único caminho para gravar nota em período fechado. Valida escola à mão '
  'porque SECURITY DEFINER ignora RLS. Usada apenas pela tela de importação.';

grant execute on function public.import_historical_grades(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 0006_school_deletion.sql
-- ---------------------------------------------------------------------

-- ============================================================================
-- Exclusão de ambiente.
--
-- É a ação mais destrutiva do sistema. A cascata a partir de `schools` leva
-- embora membros, disciplinas, alunos, configurações de nota, anos letivos e,
-- por eles, turmas, avaliações, notas, frequência, ocorrências, fechamentos e
-- resultados finais. Não há lixeira nem desfazer.
--
-- Por que uma função e não uma policy de DELETE em `schools`: uma policy
-- deixaria a exclusão a um DELETE de distância de qualquer chamada à API.
-- Aqui o caminho é único e nomeado, exige papel de admin (ser membro não
-- basta — quem foi só convidado para lecionar não apaga o ambiente inteiro),
-- e devolve o que foi apagado para a tela poder registrar.
--
-- A trava contra engano NÃO mora aqui: a tela obriga a baixar o backup e a
-- digitar o nome exato da escola antes de chamar esta função. O banco garante
-- apenas que quem chama tem o direito de fazê-lo.
-- ============================================================================

create or replace function public.delete_school(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_role    member_role;
  v_name    text;
  v_counts  jsonb;
begin
  if v_user_id is null then
    raise exception 'Sessão expirada. Entre novamente.'
      using errcode = 'insufficient_privilege';
  end if;

  select m.role into v_role
    from school_members m
   where m.school_id = p_school_id
     and m.user_id = v_user_id;

  if v_role is null then
    raise exception 'Você não tem acesso a este ambiente.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_role <> 'admin' then
    raise exception 'Só quem administra o ambiente pode excluí-lo.'
      using errcode = 'insufficient_privilege';
  end if;

  select s.name into v_name from schools s where s.id = p_school_id;

  -- Contagem antes de apagar: depois do DELETE não há mais o que contar, e
  -- este número é o que a tela mostra como recibo do que se perdeu.
  select jsonb_build_object(
    'school',      v_name,
    'students',    (select count(*) from students   where school_id = p_school_id),
    'grades',      (select count(*) from grades     where school_id = p_school_id),
    'occurrences', (select count(*) from occurrences where school_id = p_school_id),
    'closures',    (select count(*) from term_closures where school_id = p_school_id)
  ) into v_counts;

  delete from schools where id = p_school_id;

  return v_counts;
end
$fn$;

comment on function public.delete_school(uuid) is
  'Exclui um ambiente e tudo que cascateia dele. Exige papel admin. '
  'Único caminho de exclusão — schools não tem policy de DELETE.';

grant execute on function public.delete_school(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 0007_daily_attendance.sql
-- ---------------------------------------------------------------------

-- ============================================================================
-- Chamada diária — parte 1 de 2: tabelas.
--
-- Até aqui a frequência era um total por período: a professora digitava "23
-- faltas em 80 aulas". Para saber que eram 23, ela contava em outro lugar —
-- exatamente o buraco por onde a planilha sobrevivia.
--
-- `lessons` é o dia de aula (com quantas aulas foram dadas) e
-- `lesson_absences` guarda SÓ quem faltou. Guardar ausência em vez de presença
-- é o que mantém a tabela pequena: numa turma de 30, o normal é zero a três
-- linhas por dia.
--
-- IMPORTANTE — por que este arquivo está separado da 0008:
-- o SQL Editor do Supabase acrescenta "ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY" quando detecta CREATE TABLE, e o parser dele não entende
-- dollar-quoting, que é como o corpo de uma função é delimitado. Num arquivo
-- que tenha tabelas E funções, ele
-- corta no primeiro ';' de dentro do corpo da função e cola o texto ali,
-- quebrando o bloco. Mantendo tabelas e funções em arquivos separados, cada
-- um roda limpo. Por isso aqui não há NENHUM bloco dollar-quoted — nem o
-- do-block que as outras migrations usam para criar policies em lote.
--
-- Seguro de rodar mais de uma vez.
-- ============================================================================

create table if not exists lessons (
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

create table if not exists lesson_absences (
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

create index if not exists lessons_offer_term_date_idx
  on lessons (class_subject_id, term_id, lesson_date);
create index if not exists lesson_absences_student_idx
  on lesson_absences (student_id);
create index if not exists lesson_absences_lesson_idx
  on lesson_absences (lesson_id);

-- =================================================================== RLS ===
alter table lessons         enable row level security;
alter table lesson_absences enable row level security;

drop policy if exists lessons_school_access on lessons;
create policy lessons_school_access on lessons
  for all to authenticated
  using (public.is_school_member(school_id))
  with check (public.is_school_member(school_id));

drop policy if exists lesson_absences_school_access on lesson_absences;
create policy lesson_absences_school_access on lesson_absences
  for all to authenticated
  using (public.is_school_member(school_id))
  with check (public.is_school_member(school_id));


-- ---------------------------------------------------------------------
-- 0008_attendance_sync.sql
-- ---------------------------------------------------------------------

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

-- A funcao NAO recebe grant: quem a chama e o gatilho, que roda como dono.
-- Ver 0009, que revoga o EXECUTE que o Postgres concede a PUBLIC por padrao.

-- AFTER, nao BEFORE: o recalculo precisa enxergar a linha ja gravada.
drop trigger if exists lessons_sync_attendance on lessons;
create trigger lessons_sync_attendance
  after insert or update or delete on lessons
  for each row execute function public.trg_recompute_term_attendance();

drop trigger if exists lesson_absences_sync_attendance on lesson_absences;
create trigger lesson_absences_sync_attendance
  after insert or update or delete on lesson_absences
  for each row execute function public.trg_recompute_term_attendance();



-- ---------------------------------------------------------------------
-- 0009_lock_recompute_function.sql
-- ---------------------------------------------------------------------

-- ============================================================================
-- Fecha o acesso externo a recompute_term_attendance.
--
-- O Postgres concede EXECUTE a PUBLIC por padrão em toda função nova. O
-- "grant execute ... to authenticated" da 0008 não restringiu nada: era
-- redundante com um acesso que já existia para todo mundo, inclusive anon.
--
-- Testando com a chave publishable e SEM sessão, a função executava. As outras
-- funções SECURITY DEFINER do projeto se defendem sozinhas — todas começam
-- recusando quando auth.uid() é nulo, e delete_school ainda confere o papel.
-- Esta não conferia nada, porque foi escrita para ser chamada só pelo gatilho.
--
-- O risco concreto era baixo (ela não devolve dado, e recalcular produz
-- exatamente o valor derivado correto), mas exigia apenas dois UUIDs para
-- disparar escrita em term_attendance de qualquer escola. Uma função
-- SECURITY DEFINER alcançável de fora sem nenhuma checagem é uma porta que
-- não deveria existir.
--
-- A correção é privilégio mínimo em vez de mais uma checagem: quem precisa
-- chamá-la é o gatilho, e o gatilho roda como dono da função — para o dono, o
-- EXECUTE é implícito e não depende de grant nenhum.
-- ============================================================================

revoke execute on function public.recompute_term_attendance(uuid, uuid) from public;
revoke execute on function public.recompute_term_attendance(uuid, uuid) from anon;
revoke execute on function public.recompute_term_attendance(uuid, uuid) from authenticated;

comment on function public.recompute_term_attendance(uuid, uuid) is
  'Reescreve term_attendance a partir de lessons/lesson_absences. Uso interno: '
  'chamada apenas pelos gatilhos, que rodam como dono. EXECUTE revogado de '
  'public/anon/authenticated de proposito — nao reconceda.';

