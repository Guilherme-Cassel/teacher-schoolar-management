import { createClient } from '@/lib/supabase/server'
import {
  type ConductBand,
  type OccurrenceType,
  type Severity,
  conductBand,
  conductScore,
} from '@/lib/domain/conduct'

export interface DossierOccurrence {
  id: string
  type: OccurrenceType
  severity: Severity
  category: string
  description: string | null
  occurredOn: string
  subjectName: string | null
}

/**
 * Fechamento em que a nota final saiu da média calculada. É a evidência
 * formal da decisão: mostra que o ajuste foi registrado com motivo, e não
 * um favor combinado por fora.
 */
export interface DossierAdjustment {
  subjectName: string
  calculatedAverage: number
  finalGrade: number
  justification: string | null
  decidedAt: string
}

export interface DossierTerm {
  id: string
  name: string
  position: number
  occurrences: DossierOccurrence[]
  adjustments: DossierAdjustment[]
  score: number
  band: ConductBand
  praiseCount: number
  criticismCount: number
}

export interface ConductDossier {
  student: {
    id: string
    fullName: string
    registrationCode: string | null
    guardianName: string | null
  }
  terms: DossierTerm[]
  totals: {
    score: number
    band: ConductBand
    praiseCount: number
    criticismCount: number
    occurrenceCount: number
  }
}

/**
 * Dossiê de conduta de um aluno no ano: cada ocorrência com data, categoria,
 * severidade e o que a professora escreveu, agrupada por período.
 *
 * Existe porque o saldo sozinho não sustenta uma conversa com os pais. Dizer
 * "saldo +6" não significa nada para eles; mostrar seis registros datados,
 * com o que aconteceu em cada um, significa. Agrupar por período em ordem
 * crescente é deliberado: é assim que dá para enxergar melhora ou piora ao
 * longo do ano, que é justamente o que uma reunião de pais discute.
 */
export async function buildConductDossier(params: {
  schoolId: string
  studentId: string
  schoolYearId: string
}): Promise<ConductDossier | null> {
  const { schoolId, studentId, schoolYearId } = params
  const supabase = await createClient()

  const [studentRes, termsRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, registration_code, guardian_name')
      .eq('id', studentId)
      .eq('school_id', schoolId)
      .maybeSingle(),
    supabase
      .from('terms')
      .select('id, name, position')
      .eq('school_year_id', schoolYearId)
      .order('position'),
  ])

  if (!studentRes.data) return null

  const terms = termsRes.data ?? []
  const termIds = terms.map((t) => t.id)

  if (termIds.length === 0) {
    return {
      student: {
        id: studentRes.data.id,
        fullName: studentRes.data.full_name,
        registrationCode: studentRes.data.registration_code,
        guardianName: studentRes.data.guardian_name,
      },
      terms: [],
      totals: { score: 0, band: conductBand(0), praiseCount: 0, criticismCount: 0, occurrenceCount: 0 },
    }
  }

  const [occurrencesRes, closuresRes] = await Promise.all([
    supabase
      .from('occurrences')
      .select('id, type, category, severity, description, occurred_on, term_id, class_subjects(subjects(name))')
      .eq('student_id', studentId)
      .in('term_id', termIds)
      .order('occurred_on', { ascending: true }),
    supabase
      .from('term_closures')
      .select('term_id, calculated_average, final_grade, justification, decided_at, class_subjects(subjects(name))')
      .eq('student_id', studentId)
      .in('term_id', termIds)
      .eq('was_adjusted', true),
  ])

  type OccRow = {
    id: string
    type: OccurrenceType
    category: string
    severity: number
    description: string | null
    occurred_on: string
    term_id: string
    class_subjects: { subjects: { name: string } | null } | null
  }

  type ClosureRow = {
    term_id: string
    calculated_average: number
    final_grade: number
    justification: string | null
    decided_at: string
    class_subjects: { subjects: { name: string } | null } | null
  }

  const occurrences = (occurrencesRes.data ?? []) as unknown as OccRow[]
  const closures = (closuresRes.data ?? []) as unknown as ClosureRow[]

  const dossierTerms: DossierTerm[] = terms.map((term) => {
    const list: DossierOccurrence[] = occurrences
      .filter((o) => o.term_id === term.id)
      .map((o) => ({
        id: o.id,
        type: o.type,
        severity: o.severity as Severity,
        category: o.category,
        description: o.description,
        occurredOn: o.occurred_on,
        subjectName: o.class_subjects?.subjects?.name ?? null,
      }))

    const adjustments: DossierAdjustment[] = closures
      .filter((c) => c.term_id === term.id)
      .map((c) => ({
        subjectName: c.class_subjects?.subjects?.name ?? '—',
        calculatedAverage: Number(c.calculated_average),
        finalGrade: Number(c.final_grade),
        justification: c.justification,
        decidedAt: c.decided_at,
      }))

    const score = conductScore(list)

    return {
      id: term.id,
      name: term.name,
      position: term.position,
      occurrences: list,
      adjustments,
      score,
      band: conductBand(score),
      praiseCount: list.filter((o) => o.type === 'praise').length,
      criticismCount: list.filter((o) => o.type === 'criticism').length,
    }
  })

  const all = dossierTerms.flatMap((t) => t.occurrences)
  const total = conductScore(all)

  return {
    student: {
      id: studentRes.data.id,
      fullName: studentRes.data.full_name,
      registrationCode: studentRes.data.registration_code,
      guardianName: studentRes.data.guardian_name,
    },
    terms: dossierTerms,
    totals: {
      score: total,
      band: conductBand(total),
      praiseCount: all.filter((o) => o.type === 'praise').length,
      criticismCount: all.filter((o) => o.type === 'criticism').length,
      occurrenceCount: all.length,
    },
  }
}
