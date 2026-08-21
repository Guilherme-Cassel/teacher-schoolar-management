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
