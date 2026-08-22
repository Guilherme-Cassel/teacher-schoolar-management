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
