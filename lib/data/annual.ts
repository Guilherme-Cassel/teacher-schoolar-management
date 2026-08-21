import { createClient } from '@/lib/supabase/server'
import {
  type AcademicStatus,
  type AssessmentScore,
  type GradingConfig,
  annualAverage,
  attendancePercent,
  calculateAverage,
  resolveStatus,
} from '@/lib/domain/grading'
import type { StudentBrief } from './scope'

export interface AnnualTermCell {
  termId: string
  termName: string
  /** Nota registrada no fechamento daquele período; null se ainda não foi fechado. */
  finalGrade: number | null
  /** Média das avaliações lançadas — a prévia usada enquanto o período não fecha. */
  calculatedAverage: number | null
  wasAdjusted: boolean
}

export interface SavedFinalResult {
  annualAverage: number | null
  attendancePct: number | null
  status: AcademicStatus
  notes: string | null
  closedAt: string
}

export interface AnnualRow {
  student: StudentBrief
  terms: AnnualTermCell[]
  annualAverage: number | null
  attendancePct: number | null
  /** Períodos do ano que ainda não foram fechados para este aluno. */
  pendingTerms: number
  /** Quantos períodos entraram na média apenas como prévia. */
  previewTerms: number
  calculatedStatus: AcademicStatus
  saved: SavedFinalResult | null
}

/**
 * Monta o fechamento anual de uma oferta (turma + disciplina).
 *
 * A média anual prefere a nota do fechamento de cada período — ou seja, a que
 * a professora já decidiu, incluindo eventuais ajustes. Recalcular a partir
 * das avaliações descartaria justamente as decisões dela.
 *
 * Períodos ainda em aberto entram com a média calculada até ali. Antes eles
 * eram simplesmente ignorados aqui, enquanto o Boletim já os considerava: o
 * mesmo aluno tinha duas médias anuais diferentes dependendo da tela. A regra
 * agora é única e vive em annualAverage(), no domínio. `previewTerms` diz
 * quantos períodos entraram como prévia, para a tela poder sinalizar que o
 * número ainda vai mudar.
 */
export async function buildAnnualRows(params: {
  classSubjectId: string
  schoolYearId: string
  students: StudentBrief[]
  config: GradingConfig
}): Promise<{ rows: AnnualRow[]; terms: { id: string; name: string }[] }> {
  const { classSubjectId, schoolYearId, students, config } = params

  const supabase = await createClient()

  const { data: termRows } = await supabase
    .from('terms')
    .select('id, name, position')
    .eq('school_year_id', schoolYearId)
    .order('position')

  const terms = (termRows ?? []).map((t) => ({ id: t.id, name: t.name }))

  if (students.length === 0 || terms.length === 0) {
    return { rows: [], terms }
  }

  const studentIds = students.map((s) => s.id)
  const termIds = terms.map((t) => t.id)

  const [closuresRes, attendanceRes, finalsRes, assessmentsRes] = await Promise.all([
    supabase
      .from('term_closures')
      .select('student_id, term_id, final_grade, was_adjusted')
      .eq('class_subject_id', classSubjectId)
      .in('term_id', termIds)
      .in('student_id', studentIds),
    supabase
      .from('term_attendance')
      .select('student_id, classes_held, absences')
      .eq('class_subject_id', classSubjectId)
      .in('term_id', termIds)
      .in('student_id', studentIds),
    supabase
      .from('final_results')
      .select('student_id, annual_average, attendance_pct, status, notes, closed_at')
      .eq('class_subject_id', classSubjectId)
      .eq('school_year_id', schoolYearId)
      .in('student_id', studentIds),
    supabase
      .from('assessments')
      .select('id, term_id, weight, max_score')
      .eq('class_subject_id', classSubjectId)
      .in('term_id', termIds),
  ])

  const assessments = assessmentsRes.data ?? []
  const assessmentIds = assessments.map((a) => a.id)

  const { data: gradeRows } = assessmentIds.length
    ? await supabase
        .from('grades')
        .select('assessment_id, student_id, score, is_absent')
        .in('assessment_id', assessmentIds)
        .in('student_id', studentIds)
    : { data: [] }

  const gradesBy = new Map<string, Map<string, { score: number | null; isAbsent: boolean }>>()
  for (const g of gradeRows ?? []) {
    if (!gradesBy.has(g.student_id)) gradesBy.set(g.student_id, new Map())
    gradesBy.get(g.student_id)!.set(g.assessment_id, {
      score: g.score === null ? null : Number(g.score),
      isAbsent: g.is_absent,
    })
  }

  const closureBy = new Map<string, { finalGrade: number; wasAdjusted: boolean }>()
  for (const c of closuresRes.data ?? []) {
    closureBy.set(`${c.student_id}:${c.term_id}`, {
      finalGrade: Number(c.final_grade),
      wasAdjusted: c.was_adjusted,
    })
  }

  // Frequência do ano = soma de todos os períodos.
  const attendanceBy = new Map<string, { held: number; absences: number }>()
  for (const a of attendanceRes.data ?? []) {
    const acc = attendanceBy.get(a.student_id) ?? { held: 0, absences: 0 }
    acc.held += a.classes_held
    acc.absences += a.absences
    attendanceBy.set(a.student_id, acc)
  }

  const finalBy = new Map<string, SavedFinalResult>()
  for (const f of finalsRes.data ?? []) {
    finalBy.set(f.student_id, {
      annualAverage: f.annual_average === null ? null : Number(f.annual_average),
      attendancePct: f.attendance_pct === null ? null : Number(f.attendance_pct),
      status: f.status,
      notes: f.notes,
      closedAt: f.closed_at,
    })
  }

  const rows: AnnualRow[] = students.map((student) => {
    const cells: AnnualTermCell[] = terms.map((t) => {
      const closure = closureBy.get(`${student.id}:${t.id}`)

      const scores: AssessmentScore[] = assessments
        .filter((a) => a.term_id === t.id)
        .map((a) => {
          const g = gradesBy.get(student.id)?.get(a.id)
          return {
            weight: Number(a.weight),
            maxScore: Number(a.max_score),
            score: g?.score ?? null,
            isAbsent: g?.isAbsent ?? false,
          }
        })

      const { average } = calculateAverage(scores, config)

      return {
        termId: t.id,
        termName: t.name,
        finalGrade: closure?.finalGrade ?? null,
        calculatedAverage: average,
        wasAdjusted: closure?.wasAdjusted ?? false,
      }
    })

    const { average, closedCount, previewCount } = annualAverage(cells, config)

    const att = attendanceBy.get(student.id)
    const pct = att ? attendancePercent(att.held, att.absences) : null

    return {
      student,
      terms: cells,
      annualAverage: average,
      attendancePct: pct,
      pendingTerms: terms.length - closedCount,
      previewTerms: previewCount,
      calculatedStatus: resolveStatus(average ?? 0, pct, config),
      saved: finalBy.get(student.id) ?? null,
    }
  })

  return { rows, terms }
}
