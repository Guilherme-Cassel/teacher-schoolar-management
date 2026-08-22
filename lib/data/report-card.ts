import { createClient } from '@/lib/supabase/server'
import {
  type AcademicStatus,
  type AssessmentScore,
  type GradingConfig,
  DEFAULT_GRADING_CONFIG,
  annualAverage,
  attendancePercent,
  calculateAverage,
  resolveStatus,
} from '@/lib/domain/grading'
import { conductBand, type ConductBand } from '@/lib/domain/conduct'
import { type GradingConfigRow, toGradingConfig } from './context'
import type { StudentBrief } from './scope'

export interface ReportSubject {
  classSubjectId: string
  subjectName: string
}

export interface ReportCell {
  /** Nota registrada no fechamento; null se o período ainda não foi fechado. */
  finalGrade: number | null
  /** Média calculada a partir das notas lançadas. */
  calculatedAverage: number | null
  wasAdjusted: boolean
  justification: string | null
}

export interface ReportStudent {
  student: StudentBrief
  /** classSubjectId -> termId -> célula */
  cells: Record<string, Record<string, ReportCell>>
  /** classSubjectId -> média anual */
  annual: Record<string, number | null>
  /** classSubjectId -> situação */
  status: Record<string, AcademicStatus>
  /** classSubjectId -> frequência no ano, quando há aulas registradas. */
  attendance: Record<string, number | null>
  conductScore: number
  conductBand: ConductBand
}

export interface ReportCardData {
  subjects: ReportSubject[]
  terms: { id: string; name: string; position: number }[]
  students: ReportStudent[]
}

/**
 * Monta o boletim de uma turma inteira em poucas consultas: cada disciplina
 * por período, usando a nota do fechamento quando ela existe e a média
 * calculada quando o período ainda está em andamento.
 *
 * A configuração de avaliação é resolvida POR OFERTA. Antes o boletim usava
 * sempre a padrão da escola, então uma disciplina com média de aprovação
 * própria aparecia aprovando/reprovando por um critério que não era o dela —
 * e diferente do que a tela de Fechamento mostrava para o mesmo aluno.
 */
export async function buildReportCard(params: {
  schoolId: string
  classId: string
  schoolYearId: string
  students: StudentBrief[]
  /** Padrão da escola; cada oferta pode sobrescrever. */
  config: GradingConfig
}): Promise<ReportCardData> {
  const { schoolId, classId, schoolYearId, students, config } = params
  const supabase = await createClient()

  const [offersRes, termsRes, configsRes] = await Promise.all([
    supabase
      .from('class_subjects')
      .select('id, subjects(name)')
      .eq('school_id', schoolId)
      .eq('class_id', classId),
    supabase
      .from('terms')
      .select('id, name, position')
      .eq('school_year_id', schoolYearId)
      .order('position'),
    supabase.from('grading_configs').select('*').eq('school_id', schoolId),
  ])

  const subjects: ReportSubject[] = ((offersRes.data ?? []) as unknown as {
    id: string
    subjects: { name: string } | null
  }[])
    .map((o) => ({ classSubjectId: o.id, subjectName: o.subjects?.name ?? '—' }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'pt-BR'))

  const terms = termsRes.data ?? []
  const offerIds = subjects.map((s) => s.classSubjectId)
  const studentIds = students.map((s) => s.id)

  // Uma consulta traz todas as configurações da escola; a resolução por oferta
  // é feita em memória.
  const configRows = (configsRes.data ?? []) as unknown as GradingConfigRow[]
  const schoolDefault = configRows.find((r) => r.class_subject_id === null)
  const baseConfig = schoolDefault ? toGradingConfig(schoolDefault) : (config ?? DEFAULT_GRADING_CONFIG)

  const configFor = (classSubjectId: string): GradingConfig => {
    const own = configRows.find((r) => r.class_subject_id === classSubjectId)
    return own ? toGradingConfig(own) : baseConfig
  }

  if (offerIds.length === 0 || studentIds.length === 0) {
    return { subjects, terms, students: [] }
  }

  const [assessmentsRes, closuresRes, conductRes, attendanceRes] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, class_subject_id, term_id, weight, max_score')
      .in('class_subject_id', offerIds),
    supabase
      .from('term_closures')
      .select('student_id, class_subject_id, term_id, final_grade, calculated_average, was_adjusted, justification')
      .in('class_subject_id', offerIds)
      .in('student_id', studentIds),
    supabase
      .from('v_student_term_conduct')
      .select('student_id, conduct_score')
      .in('student_id', studentIds),
    // Sem a frequência real a situação do boletim divergiria da do
    // Fechamento, que já a considera: o mesmo aluno apareceria aprovado num
    // lugar e reprovado por falta no outro.
    supabase
      .from('term_attendance')
      .select('student_id, class_subject_id, classes_held, absences')
      .in('class_subject_id', offerIds)
      .in('student_id', studentIds),
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

  // student -> assessment -> nota
  const gradesBy = new Map<string, Map<string, { score: number | null; isAbsent: boolean }>>()
  for (const g of gradeRows ?? []) {
    if (!gradesBy.has(g.student_id)) gradesBy.set(g.student_id, new Map())
    gradesBy.get(g.student_id)!.set(g.assessment_id, {
      score: g.score === null ? null : Number(g.score),
      isAbsent: g.is_absent,
    })
  }

  type ClosureRecord = {
    final_grade: number
    calculated_average: number
    was_adjusted: boolean
    justification: string | null
  }

  const closureBy = new Map<string, ClosureRecord>()
  for (const c of closuresRes.data ?? []) {
    closureBy.set(`${c.student_id}:${c.class_subject_id}:${c.term_id}`, {
      final_grade: Number(c.final_grade),
      calculated_average: Number(c.calculated_average),
      was_adjusted: c.was_adjusted,
      justification: c.justification,
    })
  }

  const conductBy = new Map<string, number>()
  for (const c of conductRes.data ?? []) {
    conductBy.set(c.student_id, (conductBy.get(c.student_id) ?? 0) + (c.conduct_score as number))
  }

  // Frequência do ano por aluno+oferta = soma de todos os períodos.
  const attendanceBy = new Map<string, { held: number; absences: number }>()
  for (const a of attendanceRes.data ?? []) {
    const key = `${a.student_id}:${a.class_subject_id}`
    const acc = attendanceBy.get(key) ?? { held: 0, absences: 0 }
    acc.held += a.classes_held
    acc.absences += a.absences
    attendanceBy.set(key, acc)
  }

  const reportStudents: ReportStudent[] = students.map((student) => {
    const cells: Record<string, Record<string, ReportCell>> = {}
    const annual: Record<string, number | null> = {}
    const status: Record<string, AcademicStatus> = {}
    const attendance: Record<string, number | null> = {}

    for (const subject of subjects) {
      const subjectConfig = configFor(subject.classSubjectId)
      cells[subject.classSubjectId] = {}
      const outcomes: { finalGrade: number | null; calculatedAverage: number | null }[] = []

      for (const term of terms) {
        const relevant = assessments.filter(
          (a) => a.class_subject_id === subject.classSubjectId && a.term_id === term.id,
        )

        const scores: AssessmentScore[] = relevant.map((a) => {
          const g = gradesBy.get(student.id)?.get(a.id)
          return {
            weight: Number(a.weight),
            maxScore: Number(a.max_score),
            score: g?.score ?? null,
            isAbsent: g?.isAbsent ?? false,
          }
        })

        const { average } = calculateAverage(scores, subjectConfig)
        const closure = closureBy.get(`${student.id}:${subject.classSubjectId}:${term.id}`)

        const cell: ReportCell = {
          finalGrade: closure ? Number(closure.final_grade) : null,
          calculatedAverage: closure ? Number(closure.calculated_average) : average,
          wasAdjusted: closure?.was_adjusted ?? false,
          justification: closure?.justification ?? null,
        }

        cells[subject.classSubjectId][term.id] = cell
        outcomes.push({ finalGrade: cell.finalGrade, calculatedAverage: cell.calculatedAverage })
      }

      const { average: avg } = annualAverage(outcomes, subjectConfig)
      const att = attendanceBy.get(`${student.id}:${subject.classSubjectId}`)
      const pct = att ? attendancePercent(att.held, att.absences) : null

      annual[subject.classSubjectId] = avg
      attendance[subject.classSubjectId] = pct
      status[subject.classSubjectId] = resolveStatus(avg ?? 0, pct, subjectConfig)
    }

    const score = conductBy.get(student.id) ?? 0

    return {
      student,
      cells,
      annual,
      status,
      attendance,
      conductScore: score,
      conductBand: conductBand(score),
    }
  })

  return { subjects, terms, students: reportStudents }
}
