/**
 * Cálculo de médias e situação acadêmica.
 * Funções puras — sem I/O, sem Supabase. Toda a regra de nota mora aqui.
 */

export type GradingMethod = 'arithmetic' | 'weighted' | 'points_sum'
export type AcademicStatus = 'approved' | 'recovery' | 'failed' | 'council_approved'

export interface GradingConfig {
  passingGrade: number
  maxGrade: number
  method: GradingMethod
  decimalPlaces: number
  hasRecovery: boolean
  recoveryPassingGrade: number
  minAttendancePct: number
  /** Gap máximo (em pontos) para o fechamento considerar um ajuste. */
  adjustTolerance: number
  /** Saldo de conduta mínimo para o sistema sugerir o ajuste. */
  conductThreshold: number
}

export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  passingGrade: 6,
  maxGrade: 10,
  method: 'weighted',
  decimalPlaces: 1,
  hasRecovery: false,
  recoveryPassingGrade: 6,
  minAttendancePct: 75,
  adjustTolerance: 0.5,
  conductThreshold: 1,
}

export interface AssessmentScore {
  weight: number
  maxScore: number
  /** null = nota ainda não lançada (fica de fora da média). */
  score: number | null
  /** true = aluno faltou à avaliação (conta como zero). */
  isAbsent: boolean
}

/** Arredondamento decimal estável para as casas configuradas. */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/** Nota efetiva: ausência vale zero, nota não lançada não chega aqui. */
function effectiveScore(s: AssessmentScore): number {
  return s.isAbsent ? 0 : (s.score ?? 0)
}

/** Converte a nota para a escala máxima da configuração (ex.: prova de 0–5 → 0–10). */
function normalized(s: AssessmentScore, config: GradingConfig): number {
  return (effectiveScore(s) / s.maxScore) * config.maxGrade
}

export interface AverageResult {
  /** null quando nenhuma nota foi lançada ainda. */
  average: number | null
  /** Quantas avaliações ainda estão sem lançamento. */
  pending: number
}

export function calculateAverage(
  scores: AssessmentScore[],
  config: GradingConfig,
): AverageResult {
  const counted = scores.filter((s) => s.isAbsent || s.score !== null)
  const pending = scores.length - counted.length

  if (counted.length === 0) return { average: null, pending }

  let raw: number

  switch (config.method) {
    case 'points_sum':
      // Soma bruta dos pontos obtidos (escala original preservada).
      raw = counted.reduce((acc, s) => acc + effectiveScore(s), 0)
      break

    case 'arithmetic':
      raw = counted.reduce((acc, s) => acc + normalized(s, config), 0) / counted.length
      break

    case 'weighted': {
      const totalWeight = counted.reduce((acc, s) => acc + s.weight, 0)
      if (totalWeight === 0) return { average: null, pending }
      raw = counted.reduce((acc, s) => acc + normalized(s, config) * s.weight, 0) / totalWeight
      break
    }
  }

  return { average: roundTo(raw, config.decimalPlaces), pending }
}

/** Percentual de presença. null quando não há aulas registradas no período. */
export function attendancePercent(classesHeld: number, absences: number): number | null {
  if (classesHeld <= 0) return null
  return roundTo(((classesHeld - absences) / classesHeld) * 100, 1)
}

/** Situação a partir da nota final já decidida. */
export function resolveStatus(
  finalGrade: number,
  attendancePct: number | null,
  config: GradingConfig,
): AcademicStatus {
  if (attendancePct !== null && attendancePct < config.minAttendancePct) return 'failed'
  if (finalGrade >= config.passingGrade) return 'approved'
  return config.hasRecovery ? 'recovery' : 'failed'
}

export const ACADEMIC_STATUS_LABEL: Record<AcademicStatus, string> = {
  approved: 'Aprovado',
  recovery: 'Recuperação',
  failed: 'Reprovado',
  council_approved: 'Aprovado pelo conselho',
}
