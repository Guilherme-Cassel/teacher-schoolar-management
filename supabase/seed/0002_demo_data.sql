-- ============================================================================
-- Dados de demonstração — rodar DEPOIS de 0001_seed.sql
--
-- Preenche o 1º Bimestre com avaliações, notas, ocorrências e frequência,
-- montados para exercitar TODOS os caminhos da tela de Fechamento de uma vez.
--
-- A disciplina e a turma são configuráveis logo abaixo. Se a disciplina não
-- existir, o script cria e vincula à turma.
--
-- Pode rodar quantas vezes quiser: limpa o período antes de preencher.
-- ============================================================================

do $demo$
declare
  -- ------------------------------------------------------- configuração ----
  v_subject_name text := 'Química';
  v_class_name   text := '9º A';
  -- Desfaz a execução anterior deste script em outra disciplina da mesma turma.
  v_limpar_outras boolean := true;
  -- -------------------------------------------------------------------------

  v_school_id  uuid;
  v_term_id    uuid;
  v_class_id   uuid;
  v_subject_id uuid;
  v_cs_id      uuid;
  v_teacher_id uuid;
  v_start      date;
  v_p1         uuid;
  v_tr         uuid;
  v_p2         uuid;
  v_student    uuid;
  r            record;
begin
  select id into v_school_id from schools order by created_at limit 1;
  if v_school_id is null then
    raise exception 'Nenhuma escola encontrada. Rode 0001_seed.sql antes.';
  end if;

  select user_id into v_teacher_id
    from school_members where school_id = v_school_id limit 1;

  select t.id, t.starts_on into v_term_id, v_start
    from terms t
    join school_years y on y.id = t.school_year_id
   where y.school_id = v_school_id and t.position = 1
   order by y.year desc limit 1;

  select id into v_class_id from classes
   where school_id = v_school_id and name = v_class_name;

  if v_term_id is null or v_class_id is null then
    raise exception 'Não encontrei o 1º Bimestre ou a turma "%".', v_class_name;
  end if;

  v_start := coalesce(v_start, current_date - 60);

  -- O período precisa estar aberto: o trigger bloqueia escrita em período fechado.
  update terms set status = 'open' where id = v_term_id and status <> 'open';

  -- ------------------------------------------- garantir disciplina e oferta --
  insert into subjects (school_id, name)
  values (v_school_id, v_subject_name)
  on conflict (school_id, name) do nothing;

  select id into v_subject_id from subjects
   where school_id = v_school_id and name = v_subject_name;

  insert into class_subjects (school_id, class_id, subject_id, teacher_id)
  values (v_school_id, v_class_id, v_subject_id, v_teacher_id)
  on conflict (class_id, subject_id) do nothing;

  select id into v_cs_id from class_subjects
   where class_id = v_class_id and subject_id = v_subject_id;

  -- ------------------------------------------------------------- limpeza ---
  -- Ocorrências são do período (não da disciplina), então limpar aqui evita
  -- somar conduta de execuções anteriores.
  delete from occurrences where term_id = v_term_id;

  delete from term_closures   where class_subject_id = v_cs_id and term_id = v_term_id;
  delete from term_attendance where class_subject_id = v_cs_id and term_id = v_term_id;
  delete from assessments     where class_subject_id = v_cs_id and term_id = v_term_id;

  if v_limpar_outras then
    delete from term_closures   where term_id = v_term_id and class_subject_id in
      (select id from class_subjects where class_id = v_class_id and id <> v_cs_id);
    delete from term_attendance where term_id = v_term_id and class_subject_id in
      (select id from class_subjects where class_id = v_class_id and id <> v_cs_id);
    delete from assessments     where term_id = v_term_id and class_subject_id in
      (select id from class_subjects where class_id = v_class_id and id <> v_cs_id);
  end if;

  -- ---------------------------------------------------------- avaliações ---
  insert into assessments (school_id, class_subject_id, term_id, name, kind, weight, max_score, due_date, position)
  values (v_school_id, v_cs_id, v_term_id, 'Prova 1', 'prova', 3, 10, v_start + 25, 1)
  returning id into v_p1;

  insert into assessments (school_id, class_subject_id, term_id, name, kind, weight, max_score, due_date, position)
  values (v_school_id, v_cs_id, v_term_id, 'Relatório de laboratório', 'trabalho', 2, 10, v_start + 40, 2)
  returning id into v_tr;

  insert into assessments (school_id, class_subject_id, term_id, name, kind, weight, max_score, due_date, position)
  values (v_school_id, v_cs_id, v_term_id, 'Prova 2', 'prova', 3, 10, v_start + 70, 3)
  returning id into v_p2;

  -- ---------------------------------------------------------------- notas --
  -- Média ponderada com pesos 3, 2 e 3 (total 8).
  for r in
    select * from (values
      ('Ana Beatriz Souza',    5.5, 8.0, 4.9),  -- média 5,9
      ('Bruno Carvalho Lima',  6.0, 5.6, 6.0),  -- média 5,9  (mesma nota da Ana)
      ('Carla Menezes Rocha',  5.8, 5.8, 5.8),  -- média 5,8
      ('Diego Ferreira Alves', 9.0, 8.0, 8.5),  -- média 8,6
      ('Eduarda Nunes Prado',  4.0, 4.8, 4.0),  -- média 4,2
      ('Felipe Ramos Teixeira',5.5, 6.0, 5.7),  -- média 5,7
      ('Gabriela Martins Dias',9.5, 9.0, 9.5),  -- média 9,4
      ('Henrique Oliveira Sá', 5.5, 5.5, 5.5)   -- média 5,5  (no limite da tolerância)
    ) as t(nome, n1, n2, n3)
  loop
    select id into v_student from students
      where school_id = v_school_id and full_name = r.nome;
    continue when v_student is null;

    insert into grades (school_id, assessment_id, student_id, score) values
      (v_school_id, v_p1, v_student, r.n1),
      (v_school_id, v_tr, v_student, r.n2),
      (v_school_id, v_p2, v_student, r.n3);
  end loop;

  -- ----------------------------------------------------------- frequência --
  for r in
    select * from (values
      ('Ana Beatriz Souza',     2),
      ('Bruno Carvalho Lima',   5),
      ('Carla Menezes Rocha',   3),
      ('Diego Ferreira Alves',  1),
      ('Eduarda Nunes Prado',   8),
      ('Felipe Ramos Teixeira',16),  -- 60% de presença: abaixo do mínimo de 75%
      ('Gabriela Martins Dias', 0),
      ('Henrique Oliveira Sá',  4)
    ) as t(nome, faltas)
  loop
    select id into v_student from students
      where school_id = v_school_id and full_name = r.nome;
    continue when v_student is null;

    insert into term_attendance (school_id, student_id, class_subject_id, term_id, classes_held, absences)
    values (v_school_id, v_student, v_cs_id, v_term_id, 40, r.faltas);
  end loop;

  -- ----------------------------------------------------------- ocorrências --
  for r in
    select * from (values
      -- Ana: saldo +5 — aluna dedicada
      ('Ana Beatriz Souza','praise','Ajudou colegas',3,'Explicou a matéria para dois colegas que faltaram.',8),
      ('Ana Beatriz Souza','praise','Participação em aula',2,'Participa e faz boas perguntas no laboratório.',20),

      -- Bruno: saldo −6 — mesma nota da Ana, conduta oposta
      ('Bruno Carvalho Lima','praise','Entrega de tarefa',1,'Entregou a lista no prazo.',12),
      ('Bruno Carvalho Lima','criticism','Indisciplina',3,'Mexeu em reagentes sem autorização no laboratório.',30),
      ('Bruno Carvalho Lima','criticism','Desrespeito',3,'Respondeu mal a uma colega.',18),
      ('Bruno Carvalho Lima','criticism','Uso de celular',1,'Celular durante a prova.',5),

      -- Carla: saldo 0 — decisão livre
      ('Carla Menezes Rocha','praise','Organização',2,'Caderno e relatórios sempre em dia.',22),
      ('Carla Menezes Rocha','criticism','Conversa excessiva',2,'Conversa muito durante a explicação.',10),

      -- Diego: saldo +2
      ('Diego Ferreira Alves','praise','Participação em aula',2,'Resolveu o balanceamento no quadro.',15),

      -- Eduarda: saldo −2
      ('Eduarda Nunes Prado','criticism','Tarefa não entregue',2,'Não entregou dois relatórios seguidos.',9),

      -- Felipe: saldo +3, mas reprovado por falta
      ('Felipe Ramos Teixeira','praise','Melhora de desempenho',3,'Melhorou muito da Prova 1 para a Prova 2.',6),

      -- Gabriela: saldo +7
      ('Gabriela Martins Dias','praise','Liderança positiva',3,'Organizou o grupo do experimento.',25),
      ('Gabriela Martins Dias','praise','Ajudou colegas',2,'Ajudou a turma na revisão.',14),
      ('Gabriela Martins Dias','praise','Participação em aula',2,'Sempre participativa.',4),

      -- Henrique: saldo +2
      ('Henrique Oliveira Sá','praise','Entrega de tarefa',2,'Entregou todos os relatórios no prazo.',11),
      ('Henrique Oliveira Sá','praise','Participação em aula',1,'Participou da revisão.',7),
      ('Henrique Oliveira Sá','criticism','Atraso',1,'Chegou atrasado duas vezes.',16)
    ) as t(nome, tipo, categoria, sev, descricao, dias)
  loop
    select id into v_student from students
      where school_id = v_school_id and full_name = r.nome;
    continue when v_student is null;

    insert into occurrences
      (school_id, student_id, term_id, class_subject_id, type, category, severity, description, occurred_on)
    values
      (v_school_id, v_student, v_term_id, v_cs_id, r.tipo::occurrence_type,
       r.categoria, r.sev, r.descricao, v_start + (70 - r.dias));
  end loop;

  raise notice 'Dados de demonstração aplicados: % — % — 1º Bimestre.',
    v_class_name, v_subject_name;
end $demo$;

-- ============================================================================
-- Confira o resultado: é isto que a tela de Fechamento deve mostrar.
-- ============================================================================
select
  s.full_name                                          as aluno,
  round(sum(g.score * a.weight) / sum(a.weight), 1)    as media,
  coalesce(c.conduct_score, 0)                         as conduta,
  round(100.0 * (att.classes_held - att.absences) / att.classes_held) as freq_pct
from students s
join grades g          on g.student_id = s.id
join assessments a     on a.id = g.assessment_id
left join v_student_term_conduct c on c.student_id = s.id and c.term_id = a.term_id
left join term_attendance att      on att.student_id = s.id and att.term_id = a.term_id
group by s.full_name, c.conduct_score, att.classes_held, att.absences
order by s.full_name;
