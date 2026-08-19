/**
 * Motor de sugestão do fechamento de período.
 *
 * O caso que motivou o app: o aluno ficou 0,1 abaixo da média.
 * Se tem histórico positivo, vale arredondar; se acumulou críticas, não.
 *
 * Este módulo apenas SUGERE. A decisão e a justificativa são sempre da
 * professora — nada aqui altera nota sozinho.
 */

import {
  type AcademicStatus,
  type GradingConfig,
  resolveStatus,
  roundTo,
} from './grading'
import { type ConductBand, conductBand } from './conduct'

export type Suggestion =
  | 'adjust'       // sugerir subir para a média de aprovação
  | 'keep'         // sugerir manter a nota como está
  | 'free_choice'  // sem recomendação: decisão livre da professora
  | 'none'         // não se aplica (já passou, ou está longe demais)

export interface ClosureInput {
  calculatedAverage: number
  conductScore: number
  /** null quando não há frequência registrada no período. */
  attendancePct: number | null
  config: GradingConfig
}

export interface ClosureAnalysis {
  calculatedAverage: number
  /** Quanto falta para a média de aprovação (negativo = já passou). */
  gap: number
  conductScore: number
  conductBand: ConductBand
  attendancePct: number | null
  attendanceBelowMinimum: boolean
  suggestion: Suggestion
  /** Nota proposta quando a sugestão é 'adjust'. */
  suggestedGrade: number | null
  /** Situação considerando apenas a média calculada, sem ajuste. */
  calculatedStatus: AcademicStatus
  /** Texto exibido na tela, explicando o porquê da sugestão. */
  reason: string
}

export function analyzeClosure(input: ClosureInput): ClosureAnalysis {
  const { calculatedAverage, conductScore, attendancePct, config } = input

  const gap = roundTo(config.passingGrade - calculatedAverage, config.decimalPlaces + 2)
  const band = conductBand(conductScore)
  const attendanceBelowMinimum =
    attendancePct !== null && attendancePct < config.minAttendancePct
  const calculatedStatus = resolveStatus(calculatedAverage, attendancePct, config)

  const base = {
    calculatedAverage,
    gap,
    conductScore,
    conductBand: band,
    attendancePct,
    attendanceBelowMinimum,
    calculatedStatus,
  }

  // Frequência insuficiente bloqueia qualquer sugestão de ajuste:
  // arredondar a nota não resolveria a reprovação por falta.
  if (attendanceBelowMinimum) {
    return {
      ...base,
      suggestion: 'none',
      suggestedGrade: null,
      reason: `Frequência de ${attendancePct}% está abaixo do mínimo de ${config.minAttendancePct}%. Ajuste de nota não se aplica.`,
    }
  }

  if (gap <= 0) {
    return {
      ...base,
      suggestion: 'none',
      suggestedGrade: null,
      reason: 'Aluno já atingiu a média. Nenhuma decisão necessária.',
    }
  }

  if (gap > config.adjustTolerance) {
    return {
      ...base,
      suggestion: 'none',
      suggestedGrade: null,
      reason: `Faltam ${fmt(gap)} pontos, acima da tolerância de ${fmt(config.adjustTolerance)}. Fora da faixa de ajuste.`,
    }
  }

  // Zona de decisão: falta pouco. Aqui a conduta pesa.
  const summary = `Faltam apenas ${fmt(gap)} pontos para a média`

  if (conductScore >= config.conductThreshold) {
    return {
      ...base,
      suggestion: 'adjust',
      suggestedGrade: config.passingGrade,
      reason: `${summary} e a conduta no período é positiva (saldo ${signed(conductScore)}). Sugerido ajustar para ${fmt(config.passingGrade)}.`,
    }
  }

  if (conductScore <= -config.conductThreshold) {
    return {
      ...base,
      suggestion: 'keep',
      suggestedGrade: null,
      reason: `${summary}, mas a conduta no período é negativa (saldo ${signed(conductScore)}). Sugerido manter a nota.`,
    }
  }

  return {
    ...base,
    suggestion: 'free_choice',
    suggestedGrade: config.passingGrade,
    reason: `${summary} e a conduta é neutra (saldo ${signed(conductScore)}). Sem recomendação — decisão da professora.`,
  }
}

export const SUGGESTION_LABEL: Record<Suggestion, string> = {
  adjust: 'Sugerido ajustar',
  keep: 'Sugerido manter',
  free_choice: 'Decisão livre',
  none: '—',
}

/** Justificativa mínima exigida também pelo banco (constraint em term_closures). */
export const MIN_JUSTIFICATION_LENGTH = 10

export function validateDecision(params: {
  wasAdjusted: boolean
  justification: string | null
}): { ok: true } | { ok: false; error: string } {
  if (!params.wasAdjusted) return { ok: true }
  const text = (params.justification ?? '').trim()
  if (text.length < MIN_JUSTIFICATION_LENGTH) {
    return {
      ok: false,
      error: `Ajustar a nota exige uma justificativa de pelo menos ${MIN_JUSTIFICATION_LENGTH} caracteres.`,
    }
  }
  return { ok: true }
}

function fmt(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}
