/**
 * Trava o cenário de demonstração (supabase/seed/0002_demo_data.sql).
 *
 * A turma foi montada para exercitar todos os caminhos do fechamento de uma
 * vez. Se alguém mexer nos limiares ou no cálculo da média, este teste quebra
 * antes de a demonstração quebrar na frente de alguém.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_GRADING_CONFIG, attendancePercent, calculateAverage } from '../grading'
import { analyzeClosure, type Suggestion } from '../closure-suggestion'
import { conductScore, type OccurrenceInput } from '../conduct'

const config = DEFAULT_GRADING_CONFIG // média 6, ponderada, tolerância 0,5, limiar 1

const p = (severity: 1 | 2 | 3): OccurrenceInput => ({ type: 'praise', severity })
const c = (severity: 1 | 2 | 3): OccurrenceInput => ({ type: 'criticism', severity })

// Pesos das avaliações: Prova 1 (3), Relatório de laboratório (2), Prova 2 (3).
const WEIGHTS = [3, 2, 3]

interface Caso {
  nome: string
  notas: [number, number, number]
  ocorrencias: OccurrenceInput[]
  faltas: number
  esperado: {
    media: number
    conduta: number
    sugestao: Suggestion
  }
}

const TURMA: Caso[] = [
  {
    nome: 'Ana Beatriz Souza',
    notas: [5.5, 8.0, 4.9],
    ocorrencias: [p(3), p(2)],
    faltas: 2,
    esperado: { media: 5.9, conduta: 5, sugestao: 'adjust' },
  },
  {
    nome: 'Bruno Carvalho Lima',
    notas: [6.0, 5.6, 6.0],
    ocorrencias: [p(1), c(3), c(3), c(1)],
    faltas: 5,
    esperado: { media: 5.9, conduta: -6, sugestao: 'keep' },
  },
  {
    nome: 'Carla Menezes Rocha',
    notas: [5.8, 5.8, 5.8],
    ocorrencias: [p(2), c(2)],
    faltas: 3,
    esperado: { media: 5.8, conduta: 0, sugestao: 'free_choice' },
  },
  {
    nome: 'Diego Ferreira Alves',
    notas: [9.0, 8.0, 8.5],
    ocorrencias: [p(2)],
    faltas: 1,
    esperado: { media: 8.6, conduta: 2, sugestao: 'none' },
  },
  {
    nome: 'Eduarda Nunes Prado',
    notas: [4.0, 4.8, 4.0],
    ocorrencias: [c(2)],
    faltas: 8,
    esperado: { media: 4.2, conduta: -2, sugestao: 'none' },
  },
  {
    nome: 'Felipe Ramos Teixeira',
    notas: [5.5, 6.0, 5.7],
    ocorrencias: [p(3)],
    faltas: 16, // 60% de presença
    esperado: { media: 5.7, conduta: 3, sugestao: 'none' },
  },
  {
    nome: 'Gabriela Martins Dias',
    notas: [9.5, 9.0, 9.5],
    ocorrencias: [p(3), p(2), p(2)],
    faltas: 0,
    esperado: { media: 9.4, conduta: 7, sugestao: 'none' },
  },
  {
    nome: 'Henrique Oliveira Sá',
    notas: [5.5, 5.5, 5.5],
    ocorrencias: [p(2), p(1), c(1)],
    faltas: 4,
    esperado: { media: 5.5, conduta: 2, sugestao: 'adjust' },
  },
]

function analisar(caso: Caso) {
  const { average } = calculateAverage(
    caso.notas.map((score, i) => ({
      score,
      weight: WEIGHTS[i],
      maxScore: 10,
      isAbsent: false,
    })),
    config,
  )

  return {
    media: average!,
    conduta: conductScore(caso.ocorrencias),
    analise: analyzeClosure({
      calculatedAverage: average!,
      conductScore: conductScore(caso.ocorrencias),
      attendancePct: attendancePercent(40, caso.faltas),
      config,
    }),
  }
}

describe('cenário de demonstração — 9º A, Química, 1º Bimestre', () => {
  it.each(TURMA)('$nome', (caso) => {
    const { media, conduta, analise } = analisar(caso)
    expect(media).toBe(caso.esperado.media)
    expect(conduta).toBe(caso.esperado.conduta)
    expect(analise.suggestion).toBe(caso.esperado.sugestao)
  })

  it('Ana e Bruno têm a MESMA nota e recebem sugestões opostas', () => {
    const ana = analisar(TURMA[0])
    const bruno = analisar(TURMA[1])

    expect(ana.media).toBe(bruno.media)
    expect(ana.analise.suggestion).toBe('adjust')
    expect(bruno.analise.suggestion).toBe('keep')
  })

  it('Henrique está exatamente no limite da tolerância e ainda entra na faixa', () => {
    const { analise } = analisar(TURMA[7])
    expect(analise.gap).toBe(config.adjustTolerance)
    expect(analise.suggestion).toBe('adjust')
  })

  it('Felipe tem conduta ótima mas a falta bloqueia o ajuste', () => {
    const { analise } = analisar(TURMA[5])
    expect(analise.conductBand).toBe('very_positive')
    expect(analise.attendanceBelowMinimum).toBe(true)
    expect(analise.suggestion).toBe('none')
    expect(analise.calculatedStatus).toBe('failed')
  })

  it('a turma cobre todos os caminhos do motor de sugestão', () => {
    const sugestoes = new Set(TURMA.map((caso) => analisar(caso).analise.suggestion))
    expect(sugestoes).toEqual(new Set(['adjust', 'keep', 'free_choice', 'none']))
  })
})
