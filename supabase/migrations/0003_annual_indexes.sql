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
