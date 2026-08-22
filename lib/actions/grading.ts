'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, friendlyError, num, optStr, requireContext, str } from './_helpers'

/**
 * Salva a configuração de avaliação.
 *
 * Sem `class_subject_id` é a configuração padrão da escola; com ele, é o
 * ajuste de uma disciplina específica, que sobrescreve a padrão. Os dois
 * casos moram na mesma tabela e nesta mesma ação porque a regra é a mesma —
 * o que muda é o alcance.
 *
 * Não uso upsert: os índices únicos de grading_configs são PARCIAIS (um para
 * a linha padrão, outro para as por oferta), e o ON CONFLICT do Postgres não
 * casa com índice parcial sem a mesma cláusula WHERE. Buscar e decidir entre
 * insert e update é mais previsível do que depender disso.
 */
export async function saveGradingConfig(
  _prev: unknown,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const classSubjectId = optStr(form, 'class_subject_id')

  const maxGrade = num(form, 'max_grade', 10)
  const passingGrade = num(form, 'passing_grade', 6)
  const minAttendance = num(form, 'min_attendance_pct', 75)
  const decimalPlaces = num(form, 'decimal_places', 1)
  const adjustTolerance = num(form, 'adjust_tolerance', 0.5)
  const conductThreshold = num(form, 'conduct_threshold', 1)
  const method = str(form, 'method') || 'weighted'
  const hasRecovery = form.get('has_recovery') === 'on'

  if (maxGrade <= 0) {
    return { ok: false, error: 'A nota máxima precisa ser maior que zero.' }
  }
  if (passingGrade <= 0 || passingGrade > maxGrade) {
    return {
      ok: false,
      error: `A nota para aprovação precisa estar entre 0 e ${maxGrade}.`,
    }
  }
  if (minAttendance < 0 || minAttendance > 100) {
    return { ok: false, error: 'A frequência mínima precisa estar entre 0 e 100%.' }
  }
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 3) {
    return { ok: false, error: 'As casas decimais precisam ser 0, 1, 2 ou 3.' }
  }
  if (adjustTolerance < 0 || adjustTolerance > maxGrade) {
    return {
      ok: false,
      error: 'A tolerância de ajuste precisa ser um valor entre 0 e a nota máxima.',
    }
  }
  if (!['arithmetic', 'weighted', 'points_sum'].includes(method)) {
    return { ok: false, error: 'Método de cálculo inválido.' }
  }

  const payload = {
    school_id: ctx.schoolId,
    class_subject_id: classSubjectId,
    passing_grade: passingGrade,
    max_grade: maxGrade,
    method,
    decimal_places: decimalPlaces,
    has_recovery: hasRecovery,
    min_attendance_pct: minAttendance,
    adjust_tolerance: adjustTolerance,
    conduct_threshold: Math.round(conductThreshold),
  }

  const existing = supabase
    .from('grading_configs')
    .select('id')
    .eq('school_id', ctx.schoolId)

  const { data: found } = classSubjectId
    ? await existing.eq('class_subject_id', classSubjectId).maybeSingle()
    : await existing.is('class_subject_id', null).maybeSingle()

  const { error } = found
    ? await supabase.from('grading_configs').update(payload).eq('id', found.id)
    : await supabase.from('grading_configs').insert(payload)

  if (error) return { ok: false, error: friendlyError(error) }

  // A configuração muda média, situação e sugestão de fechamento — todas as
  // telas que mostram nota precisam ser recalculadas.
  for (const path of ['/configuracoes', '/turmas', '/notas', '/fechamento', '/relatorios', '/painel']) {
    revalidatePath(path)
  }

  return { ok: true }
}

/**
 * Remove o ajuste de uma disciplina, que volta a seguir o padrão da escola.
 *
 * Apagar a linha é o jeito certo: a resolução em getGradingConfig procura a
 * da oferta e cai na padrão quando não acha. Guardar uma cópia dos valores
 * padrão criaria uma configuração que não acompanharia mudanças futuras.
 */
export async function resetGradingConfig(classSubjectId: string): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('grading_configs')
    .delete()
    .eq('school_id', ctx.schoolId)
    .eq('class_subject_id', classSubjectId)

  if (error) return { ok: false, error: friendlyError(error) }

  for (const path of ['/configuracoes', '/turmas', '/notas', '/fechamento', '/relatorios', '/painel']) {
    revalidatePath(path)
  }

  return { ok: true }
}
