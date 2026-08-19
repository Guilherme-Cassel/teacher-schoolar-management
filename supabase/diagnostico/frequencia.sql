-- ============================================================================
-- Diagnóstico: o que está realmente gravado em term_attendance.
-- Somente leitura. Rode no SQL Editor e cole o resultado.
-- ============================================================================

select
  c.name                          as turma,
  s.name                          as disciplina,
  t.name                          as periodo,
  st.full_name                    as aluno,
  att.classes_held                as aulas_dadas,
  att.absences                    as faltas,
  round(100.0 * (att.classes_held - att.absences)
        / nullif(att.classes_held, 0))            as frequencia_pct
from term_attendance att
join class_subjects cs on cs.id = att.class_subject_id
join classes  c  on c.id  = cs.class_id
join subjects s  on s.id  = cs.subject_id
join terms    t  on t.id  = att.term_id
join students st on st.id = att.student_id
order by s.name, t.name, st.full_name;
