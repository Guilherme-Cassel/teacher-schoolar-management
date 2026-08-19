'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getGradingConfig } from '@/lib/data/context'
import { MIN_JUSTIFICATION_LENGTH, validateDecision } from '@/lib/domain/closure-suggestion'
import { conductBand } from '@/lib/domain/conduct'
import { resolveStatus } from '@/lib/domain/grading'
import { type ActionResult, friendlyError, requireContext } from './_helpers'

export interface DecisionInput {
  studentId: string
  classSubjectId: string
  termId: string
  calculatedAverage: number
  conductScore: number
  attendancePct: number | null
  suggestion: 'adjust' | 'keep' | 'free_choice' | 'none'
  /** Nota que a professora decidiu registrar. */
  finalGrade: number
  justification: string | null
}

/**
 * Registra a decisão de fechamento de um aluno.
 *
 * A média calculada é gravada intacta; o ajuste vive em final_grade com a
 * justificativa. O banco recusa um ajuste sem justificativa, então a
 * validação aqui é só para dar uma mensagem melhor antes da ida ao servidor.
 */
export async function saveClosureDecision(input: DecisionInput): Promise<ActionResult> {
  const ctx = await requireContext()
  const config = await getGradingConfig(ctx.schoolId, input.classSubjectId)

  const wasAdjusted = input.finalGrade !== input.calculatedAverage

  const valid = validateDecision({ wasAdjusted, justification: input.justification })
  if (!valid.ok) return { ok: false, error: valid.error }

  if (input.finalGrade < 0 || input.finalGrade > config.maxGrade) {
    return { ok: false, error: `A nota final deve ficar entre 0 e ${config.maxGrade}.` }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('term_closures').upsert(
    {
      school_id: ctx.schoolId,
      student_id: input.studentId,
      class_subject_id: input.classSubjectId,
      term_id: input.termId,
      calculated_average: input.calculatedAverage,
      conduct_score: input.conductScore,
      conduct_band: conductBand(input.conductScore),
      attendance_pct: input.attendancePct,
      calculated_status: resolveStatus(input.calculatedAverage, input.attendancePct, config),
      system_suggestion: input.suggestion,
      final_grade: input.finalGrade,
      was_adjusted: wasAdjusted,
      justification: wasAdjusted ? input.justification : null,
      decided_by: ctx.userId,
      decided_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,class_subject_id,term_id' },
  )

  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/fechamento')
  revalidatePath('/relatorios')
  return { ok: true }
}

/** Confirma em lote os alunos sem decisão pendente (sem sugestão de ajuste). */
export async function confirmClosuresInBulk(inputs: DecisionInput[]): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  for (const input of inputs) {
    const r = await saveClosureDecision(input)
    if (!r.ok) return { ok: false, error: r.error }
  }
  revalidatePath('/fechamento')
  return { ok: true, count: inputs.length }
}

export async function reopenClosure(
  studentId: string,
  classSubjectId: string,
  termId: string,
): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('term_closures')
    .delete()
    .eq('student_id', studentId)
    .eq('class_subject_id', classSubjectId)
    .eq('term_id', termId)

  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/fechamento')
  return { ok: true }
}

// ------------------------------------------------------- fechamento anual --

export interface FinalResultInput {
  studentId: string
  classSubjectId: string
  schoolYearId: string
  annualAverage: number | null
  attendancePct: number | null
  status: 'approved' | 'recovery' | 'failed' | 'council_approved'
  notes: string | null
}

/**
 * Grava o resultado do ano. Aprovação pelo conselho é uma decisão que contraria
 * o cálculo, então exige justificativa — mesma regra do ajuste por período.
 */
export async function saveFinalResult(input: FinalResultInput): Promise<ActionResult> {
  const ctx = await requireContext()

  if (input.status === 'council_approved') {
    const text = (input.notes ?? '').trim()
    if (text.length < MIN_JUSTIFICATION_LENGTH) {
      return {
        ok: false,
        error: `Aprovar pelo conselho exige uma justificativa de pelo menos ${MIN_JUSTIFICATION_LENGTH} caracteres.`,
      }
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('final_results').upsert(
    {
      school_id: ctx.schoolId,
      student_id: input.studentId,
      class_subject_id: input.classSubjectId,
      school_year_id: input.schoolYearId,
      annual_average: input.annualAverage,
      attendance_pct: input.attendancePct,
      status: input.status,
      notes: input.notes,
      closed_by: ctx.userId,
      closed_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,class_subject_id,school_year_id' },
  )

  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/fechamento/anual')
  revalidatePath('/relatorios')
  return { ok: true }
}

export async function saveFinalResultsInBulk(
  inputs: FinalResultInput[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  for (const input of inputs) {
    const r = await saveFinalResult(input)
    if (!r.ok) return { ok: false, error: r.error }
  }
  revalidatePath('/fechamento/anual')
  return { ok: true, count: inputs.length }
}

export async function reopenFinalResult(
  studentId: string,
  classSubjectId: string,
  schoolYearId: string,
): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('final_results')
    .delete()
    .eq('student_id', studentId)
    .eq('class_subject_id', classSubjectId)
    .eq('school_year_id', schoolYearId)

  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/fechamento/anual')
  return { ok: true }
}
