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
