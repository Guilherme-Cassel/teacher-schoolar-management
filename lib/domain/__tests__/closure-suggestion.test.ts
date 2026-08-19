import { describe, expect, it } from 'vitest'
import { DEFAULT_GRADING_CONFIG, type GradingConfig } from '../grading'
import { analyzeClosure, validateDecision } from '../closure-suggestion'

const config: GradingConfig = { ...DEFAULT_GRADING_CONFIG }

const closure = (average: number, conduct: number, attendance: number | null = 95) =>
  analyzeClosure({
    calculatedAverage: average,
    conductScore: conduct,
    attendancePct: attendance,
    config,
  })

describe('o caso que motivou o app: dois alunos com 5,9', () => {
  it('aluno dedicado (conduta +4) recebe sugestão de ajuste para 6', () => {
    const r = closure(5.9, 4)
    expect(r.suggestion).toBe('adjust')
    expect(r.suggestedGrade).toBe(6)
    expect(r.conductBand).toBe('very_positive')
  })

  it('aluno com histórico de críticas (conduta -6) recebe sugestão de manter', () => {
    const r = closure(5.9, -6)
    expect(r.suggestion).toBe('keep')
    expect(r.suggestedGrade).toBeNull()
    expect(r.conductBand).toBe('critical')
  })

  it('conduta neutra deixa a decisão livre, sem recomendação', () => {
    const r = closure(5.9, 0)
    expect(r.suggestion).toBe('free_choice')
  })
})

describe('faixa de tolerância', () => {
  it('quem já atingiu a média não gera decisão', () => {
    expect(closure(7.2, 5).suggestion).toBe('none')
    expect(closure(6.0, -5).suggestion).toBe('none')
  })

  it('gap exatamente na tolerância ainda entra na faixa de ajuste', () => {
    expect(closure(5.5, 3).suggestion).toBe('adjust')
  })

  it('gap acima da tolerância sai da faixa, mesmo com conduta ótima', () => {
    const r = closure(5.4, 9)
    expect(r.suggestion).toBe('none')
    expect(r.calculatedStatus).toBe('failed')
  })
})

describe('frequência', () => {
  it('frequência abaixo do mínimo bloqueia a sugestão de ajuste', () => {
    const r = closure(5.9, 8, 60)
    expect(r.suggestion).toBe('none')
    expect(r.attendanceBelowMinimum).toBe(true)
    expect(r.calculatedStatus).toBe('failed')
  })

  it('sem frequência registrada, a análise segue normalmente', () => {
    const r = closure(5.9, 4, null)
    expect(r.suggestion).toBe('adjust')
    expect(r.attendanceBelowMinimum).toBe(false)
  })
})

describe('limiares configuráveis', () => {
  it('exigir conduta mais alta reclassifica o mesmo aluno', () => {
    const strict: GradingConfig = { ...config, conductThreshold: 5 }
    const r = analyzeClosure({
      calculatedAverage: 5.9, conductScore: 2, attendancePct: 90, config: strict,
    })
    expect(r.suggestion).toBe('free_choice')
  })

  it('tolerância maior amplia a faixa de decisão', () => {
    const loose: GradingConfig = { ...config, adjustTolerance: 1 }
    const r = analyzeClosure({
      calculatedAverage: 5.2, conductScore: 3, attendancePct: 90, config: loose,
    })
    expect(r.suggestion).toBe('adjust')
  })
})

describe('validateDecision', () => {
  it('manter a nota não exige justificativa', () => {
    expect(validateDecision({ wasAdjusted: false, justification: null }).ok).toBe(true)
  })

  it('ajustar sem justificativa é rejeitado', () => {
    expect(validateDecision({ wasAdjusted: true, justification: '   ' }).ok).toBe(false)
    expect(validateDecision({ wasAdjusted: true, justification: 'ok' }).ok).toBe(false)
  })

  it('ajustar com justificativa suficiente é aceito', () => {
    const r = validateDecision({
      wasAdjusted: true,
      justification: 'Aluno participativo, entregou todos os trabalhos no prazo.',
    })
    expect(r.ok).toBe(true)
  })
})
