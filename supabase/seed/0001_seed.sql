-- ============================================================================
-- Seed inicial — rodar DEPOIS de 0001_initial_schema.sql
--
-- Pré-requisito: criar a usuária em Authentication -> Users
-- (marque "Auto Confirm User").
--
-- Não é preciso editar nada: o script encontra a conta sozinho.
-- Se houver mais de uma conta no projeto, preencha v_user_email abaixo.
-- ============================================================================

do $seed$
declare
  -- Opcional. Deixe vazio para usar a única conta existente.
  v_user_email text := '';

  v_user_id   uuid;
  v_school_id uuid;
  v_year_id   uuid;
  v_class_id  uuid;
  v_math_id   uuid;
  v_user_count int;
  v_student_id uuid;
  v_names     text[] := array[
    'Ana Beatriz Souza','Bruno Carvalho Lima','Carla Menezes Rocha',
    'Diego Ferreira Alves','Eduarda Nunes Prado','Felipe Ramos Teixeira',
    'Gabriela Martins Dias','Henrique Oliveira Sá'
  ];
  i int;
begin
  -- ------------------------------------------------ localizar a usuária ----
  if v_user_email <> '' then
    select id into v_user_id from auth.users where lower(email) = lower(v_user_email);
    if v_user_id is null then
      raise exception 'Nenhuma conta com o e-mail "%". Crie em Authentication > Users.', v_user_email;
    end if;
  else
    select count(*) into v_user_count from auth.users;

    if v_user_count = 0 then
      raise exception 'Nenhuma conta cadastrada. Crie uma em Authentication > Users e rode de novo.';
    elsif v_user_count > 1 then
      raise exception 'Há % contas neste projeto. Preencha v_user_email no topo deste script.', v_user_count;
    end if;

    select id into v_user_id from auth.users limit 1;
  end if;

  -- ------------------------------------------------------ evitar repetir ---
  if exists (select 1 from school_members where user_id = v_user_id) then
    raise exception 'Esta conta já está vinculada a uma escola. O seed já foi aplicado.';
  end if;

  -- ------------------------------------------------------------- escola ----
  insert into schools (name) values ('Escola Modelo')
    returning id into v_school_id;

  insert into school_members (school_id, user_id, role, display_name)
    values (v_school_id, v_user_id, 'admin', 'Professora');

  insert into school_years (school_id, year, starts_on, ends_on, is_current)
    values (v_school_id, 2026, '2026-02-02', '2026-12-18', true)
    returning id into v_year_id;

  -- 4 bimestres; o primeiro já aberto para lançamento.
  insert into terms (school_id, school_year_id, name, position, starts_on, ends_on, status) values
    (v_school_id, v_year_id, '1º Bimestre', 1, '2026-02-02', '2026-04-24', 'open'),
    (v_school_id, v_year_id, '2º Bimestre', 2, '2026-04-27', '2026-07-03', 'planned'),
    (v_school_id, v_year_id, '3º Bimestre', 3, '2026-08-03', '2026-10-02', 'planned'),
    (v_school_id, v_year_id, '4º Bimestre', 4, '2026-10-05', '2026-12-18', 'planned');

  insert into subjects (school_id, name) values
    (v_school_id, 'Matemática'), (v_school_id, 'Português'),
    (v_school_id, 'Ciências'),   (v_school_id, 'História'),
    (v_school_id, 'Geografia');

  select id into v_math_id from subjects
    where school_id = v_school_id and name = 'Matemática';

  insert into classes (school_id, school_year_id, name, shift)
    values (v_school_id, v_year_id, '9º A', 'manhã')
    returning id into v_class_id;

  insert into class_subjects (school_id, class_id, subject_id, teacher_id)
    values (v_school_id, v_class_id, v_math_id, v_user_id);

  -- Configuração padrão da escola: média 6, ponderada, tolerância de 0,5.
  insert into grading_configs (school_id) values (v_school_id);

  -- -------------------------------------------------------------- alunos ---
  for i in 1 .. array_length(v_names, 1) loop
    insert into students (school_id, full_name, registration_code)
      values (v_school_id, v_names[i], lpad(i::text, 4, '0'))
      returning id into v_student_id;

    insert into enrollments (school_id, student_id, class_id)
      values (v_school_id, v_student_id, v_class_id);
  end loop;

  raise notice 'Seed aplicado. Escola %, turma 9º A com % alunos, 1º Bimestre aberto.',
    v_school_id, array_length(v_names, 1);
end $seed$;
