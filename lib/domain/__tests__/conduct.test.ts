import { describe, expect, it } from 'vitest'
import { type OccurrenceInput, conductBand, conductScore, severityLabel } from '../conduct'

const praise = (severity: 1 | 2 | 3): OccurrenceInput => ({ type: 'praise', severity })
const criticism = (severity: 1 | 2 | 3): OccurrenceInput => ({ type: 'criticism', severity })

describe('conductScore', () => {
  it('sem ocorrências, o saldo é zero', () => {
    expect(conductScore([])).toBe(0)
  })

  it('elogios somam e críticas subtraem, ponderados pela severidade', () => {
    expect(conductScore([praise(3), praise(1), criticism(2)])).toBe(2)
    expect(conductScore([criticism(3), criticism(3)])).toBe(-6)
  })

  it('uma crítica grave anula três elogios leves', () => {
    expect(conductScore([praise(1), praise(1), praise(1), criticism(3)])).toBe(0)
  })
})

describe('conductBand — limites exatos das faixas', () => {
  it.each([
    [5, 'very_positive'], [3, 'very_positive'],
    [2, 'positive'], [1, 'positive'],
    [0, 'neutral'],
    [-1, 'attention'], [-2, 'attention'],
    [-3, 'critical'], [-8, 'critical'],
  ])('saldo %i => %s', (score, expected) => {
    expect(conductBand(score)).toBe(expected)
  })
})

describe('severityLabel', () => {
  it('usa a escala de gravidade para críticas', () => {
    expect(severityLabel('criticism', 1)).toBe('Leve')
    expect(severityLabel('criticism', 2)).toBe('Moderada')
    expect(severityLabel('criticism', 3)).toBe('Grave')
  })

  it('nunca chama um elogio de "grave"', () => {
    // O dossiê de conduta vai para a mão dos pais: "Ajudou colegas — Grave"
    // não pode acontecer.
    expect(severityLabel('praise', 3)).toBe('Destaque')
    expect(severityLabel('praise', 2)).toBe('Relevante')
    expect(severityLabel('praise', 1)).toBe('Simples')
  })

  it('dá rótulos diferentes para os dois tipos na mesma severidade', () => {
    for (const s of [1, 2, 3] as const) {
      expect(severityLabel('praise', s)).not.toBe(severityLabel('criticism', s))
    }
  })
})
