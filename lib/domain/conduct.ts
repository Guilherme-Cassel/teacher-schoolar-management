/**
 * Índice de conduta a partir das ocorrências de sala de aula.
 * Elogios somam, críticas subtraem, ponderados pela severidade.
 */

export type OccurrenceType = 'praise' | 'criticism'
export type Severity = 1 | 2 | 3
export type ConductBand = 'very_positive' | 'positive' | 'neutral' | 'attention' | 'critical'

export interface OccurrenceInput {
  type: OccurrenceType
  severity: Severity
}

/** saldo = Σ(elogios × severidade) − Σ(críticas × severidade) */
export function conductScore(occurrences: OccurrenceInput[]): number {
  return occurrences.reduce(
    (acc, o) => acc + (o.type === 'praise' ? o.severity : -o.severity),
    0,
  )
}

export function conductBand(score: number): ConductBand {
  if (score >= 3) return 'very_positive'
  if (score >= 1) return 'positive'
  if (score === 0) return 'neutral'
  if (score >= -2) return 'attention'
  return 'critical'
}

export const CONDUCT_BAND_LABEL: Record<ConductBand, string> = {
  very_positive: 'Muito positivo',
  positive: 'Positivo',
  neutral: 'Neutro',
  attention: 'Atenção',
  critical: 'Crítico',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  1: 'Leve',
  2: 'Moderada',
  3: 'Grave',
}

/**
 * A severidade é a mesma escala 1–3 para elogio e crítica, mas as palavras
 * não servem para os dois: "Ajudou colegas — Grave" está errado. Como o
 * relatório de conduta vai para a mão dos pais, o rótulo precisa acompanhar
 * o tipo da ocorrência.
 */
const PRAISE_WEIGHT_LABEL: Record<Severity, string> = {
  1: 'Simples',
  2: 'Relevante',
  3: 'Destaque',
}

export function severityLabel(type: OccurrenceType, severity: Severity): string {
  return type === 'praise' ? PRAISE_WEIGHT_LABEL[severity] : SEVERITY_LABEL[severity]
}

/** Categorias sugeridas; a professora pode digitar outras. */
export const PRAISE_CATEGORIES = [
  'Participação em aula',
  'Entrega de tarefa',
  'Ajudou colegas',
  'Melhora de desempenho',
  'Organização',
  'Liderança positiva',
] as const

export const CRITICISM_CATEGORIES = [
  'Indisciplina',
  'Tarefa não entregue',
  'Uso de celular',
  'Atraso',
  'Desrespeito',
  'Conversa excessiva',
] as const
