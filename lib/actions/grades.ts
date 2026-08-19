'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  type ActionResult,
  friendlyError,
  num,
  optStr,
  requireContext,
  str,
} from './_helpers'

// ------------------------------------------------------------- avaliações --

export async function saveAssessment(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const id = optStr(form, 'id')
  const name = str(form, 'name')
  if (!name) return { ok: false, error: 'Informe o nome da avaliação.' }

  const weight = num(form, 'weight', 1)
  const maxScore = num(form, 'max_score', 10)
  if (weight <= 0) return { ok: false, error: 'O peso deve ser maior que zero.' }
  if (maxScore <= 0) return { ok: false, error: 'A nota máxima deve ser maior que zero.' }

  // Campos editáveis. O vínculo (turma+disciplina, período) nunca muda na edição.
  const fields = {
    name,
    kind: str(form, 'kind') || 'prova',
    weight,
    max_score: maxScore,
    due_date: optStr(form, 'due_date'),
    position: num(form, 'position', 0),
  }

  const { error } = id
    ? await supabase.from('assessments').update(fields).eq('id', id)
    : await supabase.from('assessments').insert({
        ...fields,
        school_id: ctx.schoolId,
        class_subject_id: str(form, 'class_subject_id'),
        term_id: str(form, 'term_id'),
      })

  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/notas')
  return { ok: true }
}

export async function deleteAssessment(id: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()
  const { error } = await supabase.from('assessments').delete().eq('id', id)
  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/notas')
  return { ok: true }
}

// ------------------------------------------------------------------ notas --

/**
 * Salva uma célula da grade. Chamado a cada saída de campo, então precisa ser
 * enxuto: sem revalidatePath, para não recarregar a página inteira enquanto a
 * professora digita. A tela mantém o estado localmente.
 */
export async function saveGrade(params: {
  assessmentId: string
  studentId: string
  score: number | null
  isAbsent: boolean
}): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { error } = await supabase.from('grades').upsert(
    {
      school_id: ctx.schoolId,
      assessment_id: params.assessmentId,
      student_id: params.studentId,
      score: params.isAbsent ? null : params.score,
      is_absent: params.isAbsent,
      updated_by: ctx.userId,
    },
    { onConflict: 'assessment_id,student_id' },
  )

  if (error) return { ok: false, error: friendlyError(error) }
  return { ok: true }
}

// ------------------------------------------------------------- frequência --

export async function saveAttendance(params: {
  studentId: string
  classSubjectId: string
  termId: string
  classesHeld: number
  absences: number
}): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  if (params.absences > params.classesHeld) {
    return { ok: false, error: 'As faltas não podem ser maiores que o total de aulas.' }
  }

  const { error } = await supabase.from('term_attendance').upsert(
    {
      school_id: ctx.schoolId,
      student_id: params.studentId,
      class_subject_id: params.classSubjectId,
      term_id: params.termId,
      classes_held: params.classesHeld,
      absences: params.absences,
    },
    { onConflict: 'student_id,class_subject_id,term_id' },
  )

  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/fechamento')
  return { ok: true }
}

/** Define o total de aulas do período para a turma inteira de uma vez. */
export async function setClassesHeld(params: {
  classSubjectId: string
  termId: string
  studentIds: string[]
  classesHeld: number
}): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('term_attendance')
    .select('student_id, absences')
    .eq('class_subject_id', params.classSubjectId)
    .eq('term_id', params.termId)

  const absencesBy = new Map((existing ?? []).map((r) => [r.student_id, r.absences]))

  const rows = params.studentIds.map((studentId) => ({
    school_id: ctx.schoolId,
    student_id: studentId,
    class_subject_id: params.classSubjectId,
    term_id: params.termId,
    classes_held: params.classesHeld,
    absences: Math.min(absencesBy.get(studentId) ?? 0, params.classesHeld),
  }))

  const { error } = await supabase
    .from('term_attendance')
    .upsert(rows, { onConflict: 'student_id,class_subject_id,term_id' })

  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/notas')
  revalidatePath('/fechamento')
  return { ok: true }
}
