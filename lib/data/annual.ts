import { createClient } from '@/lib/supabase/server'
import {
  type AcademicStatus,
  type GradingConfig,
  attendancePercent,
  resolveStatus,
  roundTo,
} from '@/lib/domain/grading'
import type { StudentBrief } from './scope'

export interface AnnualTermCell {
  termId: string
  termName: string
  /** Nota registrada no fechamento daquele período; null se ainda não foi fechado. */
  finalGrade: number | null
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
  calculatedStatus: AcademicStatus
  saved: SavedFinalResult | null
}

/**
 * Monta o fechamento anual de uma oferta (turma + disciplina).
 *
 * A média anual sai dos fechamentos de período — ou seja, das notas que a
 * professora já decidiu, incluindo eventuais ajustes. Recalcular a partir das
 * avaliações descartaria justamente as decisões dela.
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

  const [closuresRes, attendanceRes, finalsRes] = await Promise.all([
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
  ])

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
      return {
        termId: t.id,
        termName: t.name,
        finalGrade: closure?.finalGrade ?? null,
        wasAdjusted: closure?.wasAdjusted ?? false,
      }
    })

    const closed = cells.filter((c) => c.finalGrade !== null)
    const annualAverage =
      closed.length > 0
        ? roundTo(
            closed.reduce((acc, c) => acc + c.finalGrade!, 0) / closed.length,
            config.decimalPlaces,
          )
        : null

    const att = attendanceBy.get(student.id)
    const pct = att ? attendancePercent(att.held, att.absences) : null

    return {
      student,
      terms: cells,
      annualAverage,
      attendancePct: pct,
      pendingTerms: terms.length - closed.length,
      calculatedStatus: resolveStatus(annualAverage ?? 0, pct, config),
      saved: finalBy.get(student.id) ?? null,
    }
  })

  return { rows, terms }
}
