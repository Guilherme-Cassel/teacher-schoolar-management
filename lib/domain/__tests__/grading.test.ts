import { describe, expect, it } from 'vitest'
import {
  type AssessmentScore, type GradingConfig,
  DEFAULT_GRADING_CONFIG, attendancePercent, calculateAverage, resolveStatus, roundTo,
} from '../grading'

const cfg = (over: Partial<GradingConfig> = {}): GradingConfig => ({
  ...DEFAULT_GRADING_CONFIG, ...over,
})

const s = (score: number | null, weight = 1, maxScore = 10, isAbsent = false): AssessmentScore =>
  ({ score, weight, maxScore, isAbsent })

describe('calculateAverage', () => {
  it('média aritmética simples', () => {
    const r = calculateAverage([s(8), s(6), s(7)], cfg({ method: 'arithmetic' }))
    expect(r.average).toBe(7)
    expect(r.pending).toBe(0)
  })

  it('média ponderada respeita os pesos', () => {
    // (8*1 + 5*3) / 4 = 5.75 -> 5.8 com 1 casa
    const r = calculateAverage([s(8, 1), s(5, 3)], cfg({ method: 'weighted' }))
    expect(r.average).toBe(5.8)
  })

  it('normaliza avaliações com escalas diferentes', () => {
    // Trabalho de 0–5 valendo 4 equivale a 8 na escala 0–10.
    const r = calculateAverage(
      [s(4, 1, 5), s(8, 1, 10)],
      cfg({ method: 'arithmetic' }),
    )
    expect(r.average).toBe(8)
  })

  it('soma de pontos preserva a escala original', () => {
    const r = calculateAverage([s(30, 1, 40), s(25, 1, 60)], cfg({ method: 'points_sum' }))
    expect(r.average).toBe(55)
  })

  it('nota não lançada fica de fora e é contada como pendente', () => {
    const r = calculateAverage([s(8), s(null), s(6)], cfg({ method: 'arithmetic' }))
    expect(r.average).toBe(7)
    expect(r.pending).toBe(1)
  })

  it('ausência conta como zero e entra na média', () => {
    const r = calculateAverage(
      [s(9), s(null, 1, 10, true)],
      cfg({ method: 'arithmetic' }),
    )
    expect(r.average).toBe(4.5)
    expect(r.pending).toBe(0)
  })

  it('sem nenhuma nota lançada, a média é nula', () => {
    const r = calculateAverage([s(null), s(null)], cfg())
    expect(r.average).toBeNull()
    expect(r.pending).toBe(2)
  })

  it('respeita as casas decimais configuradas', () => {
    const scores = [s(8.35), s(7.42)]
    expect(calculateAverage(scores, cfg({ method: 'arithmetic', decimalPlaces: 0 })).average).toBe(8)
    expect(calculateAverage(scores, cfg({ method: 'arithmetic', decimalPlaces: 2 })).average).toBe(7.89)
  })
})

describe('roundTo', () => {
  it('arredonda meio para cima', () => {
    expect(roundTo(5.95, 1)).toBe(6)
    expect(roundTo(5.94, 1)).toBe(5.9)
    expect(roundTo(1.005, 2)).toBe(1.01)
  })
})

describe('attendancePercent', () => {
  it('calcula o percentual de presença', () => {
    expect(attendancePercent(40, 10)).toBe(75)
    expect(attendancePercent(40, 0)).toBe(100)
  })

  it('sem aulas registradas, retorna null', () => {
    expect(attendancePercent(0, 0)).toBeNull()
  })
})

describe('resolveStatus', () => {
  it('aprova quem atingiu a média', () => {
    expect(resolveStatus(6, 90, cfg())).toBe('approved')
  })

  it('reprova por falta mesmo com nota boa', () => {
    expect(resolveStatus(9.5, 60, cfg())).toBe('failed')
  })

  it('manda para recuperação quando a escola tem recuperação', () => {
    expect(resolveStatus(5, 90, cfg({ hasRecovery: true }))).toBe('recovery')
    expect(resolveStatus(5, 90, cfg({ hasRecovery: false }))).toBe('failed')
  })
})
