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
