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

export interface TermOutcome {
  /** Nota registrada no fechamento; null enquanto o período não foi fechado. */
  finalGrade: number | null
  /** Média das avaliações lançadas; null quando nada foi lançado ainda. */
  calculatedAverage: number | null
}

export interface AnnualAverageResult {
  average: number | null
  /** Períodos que entraram com nota já decidida no fechamento. */
  closedCount: number
  /** Períodos que entraram apenas como prévia (ainda em andamento). */
  previewCount: number
  /** Períodos sem nota nenhuma, que ficaram de fora da conta. */
  emptyCount: number
}

/**
 * Média anual a partir dos períodos.
 *
 * Um período fechado entra com a nota decidida pela professora (que pode ter
 * sido ajustada); um período em andamento entra com a média calculada até
 * ali; um período sem nenhuma nota fica de fora — incluí-lo como zero
 * afundaria a média de todo mundo em março.
 *
 * Esta função existe porque o Boletim e o Fechamento anual calculavam a média
 * anual de formas diferentes: um considerava períodos em aberto, o outro não,
 * e os dois mostravam números diferentes para o mesmo aluno. Qual regra vale
 * é decisão de negócio, então ela mora aqui e é testada, em vez de repetida
 * na montagem de cada tela.
 */
export function annualAverage(
  terms: TermOutcome[],
  config: GradingConfig,
): AnnualAverageResult {
  let closedCount = 0
  let previewCount = 0
  let emptyCount = 0
  const values: number[] = []

  for (const term of terms) {
    if (term.finalGrade !== null) {
      closedCount++
      values.push(term.finalGrade)
    } else if (term.calculatedAverage !== null) {
      previewCount++
      values.push(term.calculatedAverage)
    } else {
      emptyCount++
    }
  }

  const average =
    values.length > 0
      ? roundTo(values.reduce((acc, n) => acc + n, 0) / values.length, config.decimalPlaces)
      : null

  return { average, closedCount, previewCount, emptyCount }
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
