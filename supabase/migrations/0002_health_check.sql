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
