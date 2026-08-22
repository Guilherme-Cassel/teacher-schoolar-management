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
