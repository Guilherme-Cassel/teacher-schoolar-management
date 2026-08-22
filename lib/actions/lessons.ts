'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, friendlyError, num, optStr, requireContext, str } from './_helpers'

function revalidateAttendance() {
  for (const path of ['/frequencia', '/fechamento', '/relatorios', '/painel']) {
    revalidatePath(path)
  }
}

/**
 * Salva a chamada de um dia.
 *
 * Grava a aula e a lista de quem faltou numa tacada: a professora marca as
 * ausências e salva uma vez, em vez de uma ida ao servidor por aluno. O total
 * do período (`term_attendance`) é recalculado pelo banco, por trigger — ver
 * migration 0007.
 *
 * Regravar o mesmo dia substitui a chamada anterior inteira. É o que se espera
 * de uma correção: se ela desmarcou alguém, esse alguém deixou de faltar.
 */
export async function saveLesson(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const classSubjectId = str(form, 'class_subject_id')
  const termId = str(form, 'term_id')
  const lessonDate = str(form, 'lesson_date')
  const periods = num(form, 'periods', 1)
  const topic = optStr(form, 'topic')

  if (!classSubjectId || !termId) {
    return { ok: false, error: 'Escolha a turma, a disciplina e o período.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) {
    return { ok: false, error: 'Informe a data da aula.' }
  }
  if (!Number.isInteger(periods) || periods < 1 || periods > 10) {
    return { ok: false, error: 'A quantidade de aulas no dia precisa ser de 1 a 10.' }
  }

  const absentIds = form.getAll('ausente').map(String).filter(Boolean)

  // A aula precisa existir antes das faltas — elas apontam para ela.
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .upsert(
      {
        school_id: ctx.schoolId,
        class_subject_id: classSubjectId,
        term_id: termId,
        lesson_date: lessonDate,
        periods,
        topic,
        created_by: ctx.userId,
      },
      { onConflict: 'class_subject_id,lesson_date' },
    )
    .select('id')
    .single()

  if (lessonError) return { ok: false, error: friendlyError(lessonError) }

  // Apaga e regrava: comparar o que mudou custaria mais consultas do que
  // reescrever a lista, que numa turma tem no máximo algumas dezenas.
  const { error: clearError } = await supabase
    .from('lesson_absences')
    .delete()
    .eq('lesson_id', lesson.id)

  if (clearError) return { ok: false, error: friendlyError(clearError) }

  if (absentIds.length > 0) {
    const justified = new Set(form.getAll('justificada').map(String))

    const { error: insertError } = await supabase.from('lesson_absences').insert(
      absentIds.map((studentId) => ({
        school_id: ctx.schoolId,
        lesson_id: lesson.id,
        student_id: studentId,
        justified: justified.has(studentId),
      })),
    )

    if (insertError) return { ok: false, error: friendlyError(insertError) }
  }

  revalidateAttendance()
  return { ok: true }
}

/** Remove a chamada de um dia. As faltas dele somem junto, por cascata. */
export async function deleteLesson(lessonId: string): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId)
    .eq('school_id', ctx.schoolId)

  if (error) return { ok: false, error: friendlyError(error) }

  revalidateAttendance()
  return { ok: true }
}
