import { createClient } from '@/lib/supabase/server'
import {
  type AssessmentScore,
  type GradingConfig,
  attendancePercent,
  calculateAverage,
  resolveStatus,
} from '@/lib/domain/grading'
import { analyzeClosure, type ClosureAnalysis } from '@/lib/domain/closure-suggestion'
import type { StudentBrief } from './scope'

export interface OccurrenceBrief {
  id: string
  type: 'praise' | 'criticism'
  category: string
  severity: 1 | 2 | 3
  description: string | null
  occurred_on: string
}

export interface SavedClosure {
  finalGrade: number
  wasAdjusted: boolean
  justification: string | null
  decidedAt: string
  calculatedAverage: number
}

export interface ClosureRow {
  student: StudentBrief
  analysis: ClosureAnalysis
  /** Avaliações ainda sem nota lançada. Bloqueia o fechamento. */
  pending: number
  occurrences: OccurrenceBrief[]
  attendance: { classesHeld: number; absences: number } | null
  saved: SavedClosure | null
}

/**
 * Monta a tela de fechamento: para cada aluno, cruza notas, conduta e
 * frequência e pede a sugestão ao motor de decisão.
 */
export async function buildClosureRows(params: {
  classSubjectId: string
  termId: string
  students: StudentBrief[]
  config: GradingConfig
}): Promise<ClosureRow[]> {
  const { classSubjectId, termId, students, config } = params
  if (students.length === 0) return []

  const supabase = await createClient()
  const studentIds = students.map((s) => s.id)

  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, weight, max_score')
    .eq('class_subject_id', classSubjectId)
    .eq('term_id', termId)

  const assessmentList = assessments ?? []
  const assessmentIds = assessmentList.map((a) => a.id)

  const [gradesRes, occurrencesRes, attendanceRes, closuresRes] = await Promise.all([
    assessmentIds.length
      ? supabase
          .from('grades')
          .select('assessment_id, student_id, score, is_absent')
          .in('assessment_id', assessmentIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('occurrences')
      .select('id, student_id, type, category, severity, description, occurred_on')
      .eq('term_id', termId)
      .in('student_id', studentIds)
      .order('occurred_on', { ascending: false }),
    supabase
      .from('term_attendance')
      .select('student_id, classes_held, absences')
      .eq('class_subject_id', classSubjectId)
      .eq('term_id', termId),
    supabase
      .from('term_closures')
      .select('student_id, final_grade, was_adjusted, justification, decided_at, calculated_average')
      .eq('class_subject_id', classSubjectId)
      .eq('term_id', termId),
  ])

  // Índices por aluno, para não varrer os arrays dentro do laço.
  const gradesBy = new Map<string, Map<string, { score: number | null; isAbsent: boolean }>>()
  for (const g of gradesRes.data ?? []) {
    if (!gradesBy.has(g.student_id)) gradesBy.set(g.student_id, new Map())
    gradesBy.get(g.student_id)!.set(g.assessment_id, {
      score: g.score === null ? null : Number(g.score),
      isAbsent: g.is_absent,
    })
  }

  const occurrencesBy = new Map<string, OccurrenceBrief[]>()
  for (const o of occurrencesRes.data ?? []) {
    const list = occurrencesBy.get(o.student_id) ?? []
    list.push({
      id: o.id,
      type: o.type,
      category: o.category,
      severity: o.severity as 1 | 2 | 3,
      description: o.description,
      occurred_on: o.occurred_on,
    })
    occurrencesBy.set(o.student_id, list)
  }

  const attendanceBy = new Map(
    (attendanceRes.data ?? []).map((a) => [
      a.student_id,
      { classesHeld: a.classes_held, absences: a.absences },
    ]),
  )

  const closureBy = new Map(
    (closuresRes.data ?? []).map((c) => [
      c.student_id,
      {
        finalGrade: Number(c.final_grade),
        wasAdjusted: c.was_adjusted,
        justification: c.justification,
        decidedAt: c.decided_at,
        calculatedAverage: Number(c.calculated_average),
      } satisfies SavedClosure,
    ]),
  )

  return students.map((student) => {
    const studentGrades = gradesBy.get(student.id)

    const scores: AssessmentScore[] = assessmentList.map((a) => {
      const g = studentGrades?.get(a.id)
      return {
        weight: Number(a.weight),
        maxScore: Number(a.max_score),
        score: g?.score ?? null,
        isAbsent: g?.isAbsent ?? false,
      }
    })

    const { average, pending } = calculateAverage(scores, config)
    const occurrences = occurrencesBy.get(student.id) ?? []
    const conductScore = occurrences.reduce(
      (acc, o) => acc + (o.type === 'praise' ? o.severity : -o.severity),
      0,
    )

    const attendance = attendanceBy.get(student.id) ?? null
    const pct = attendance ? attendancePercent(attendance.classesHeld, attendance.absences) : null

    const calculatedAverage = average ?? 0

    const analysis = analyzeClosure({
      calculatedAverage,
      conductScore,
      attendancePct: pct,
      config,
    })

    return {
      student,
      // Sem nenhuma nota lançada, não faz sentido sugerir nada.
      analysis:
        average === null
          ? {
              ...analysis,
              suggestion: 'none' as const,
              suggestedGrade: null,
              calculatedStatus: resolveStatus(0, pct, config),
              reason: 'Nenhuma nota lançada neste período.',
            }
          : analysis,
      pending,
      occurrences,
      attendance,
      saved: closureBy.get(student.id) ?? null,
    }
  })
}
