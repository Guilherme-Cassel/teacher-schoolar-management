import { createClient } from '@/lib/supabase/server'

export interface LessonSummary {
  id: string
  date: string
  periods: number
  topic: string | null
  absentCount: number
}

export interface LessonDetail {
  id: string
  date: string
  periods: number
  topic: string | null
  /** studentId -> justificada */
  absences: Record<string, boolean>
}

/** Aulas já registradas no período, da mais recente para a mais antiga. */
export async function getTermLessons(
  classSubjectId: string,
  termId: string,
): Promise<LessonSummary[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('lessons')
    .select('id, lesson_date, periods, topic, lesson_absences(id)')
    .eq('class_subject_id', classSubjectId)
    .eq('term_id', termId)
    .order('lesson_date', { ascending: false })

  return ((data ?? []) as unknown as {
    id: string
    lesson_date: string
    periods: number
    topic: string | null
    lesson_absences: { id: string }[]
  }[]).map((l) => ({
    id: l.id,
    date: l.lesson_date,
    periods: l.periods,
    topic: l.topic,
    absentCount: l.lesson_absences?.length ?? 0,
  }))
}

/** A chamada de um dia específico, para reabrir e corrigir. */
export async function getLesson(
  classSubjectId: string,
  date: string,
): Promise<LessonDetail | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('lessons')
    .select('id, lesson_date, periods, topic, lesson_absences(student_id, justified)')
    .eq('class_subject_id', classSubjectId)
    .eq('lesson_date', date)
    .maybeSingle()

  if (!data) return null

  const row = data as unknown as {
    id: string
    lesson_date: string
    periods: number
    topic: string | null
    lesson_absences: { student_id: string; justified: boolean }[]
  }

  return {
    id: row.id,
    date: row.lesson_date,
    periods: row.periods,
    topic: row.topic,
    absences: Object.fromEntries(
      (row.lesson_absences ?? []).map((a) => [a.student_id, a.justified]),
    ),
  }
}
