import { getAppContext, type AppContext } from '@/lib/data/context'

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function requireContext(): Promise<AppContext> {
  const ctx = await getAppContext()
  if (!ctx) throw new Error('Sessão expirada. Entre novamente.')
  return ctx
}

/** Converte erros do Postgres em mensagens legíveis para a professora. */
export function friendlyError(error: { message: string; code?: string }): string {
  const m = error.message

  if (error.code === '23505') return 'Já existe um registro com esses dados.'
  if (m.includes('está fechado')) return m.replace(/^.*?ERROR:\s*/, '')
  if (m.includes('term_closures_adjustment_needs_reason')) {
    return 'Ajustar a nota exige uma justificativa de pelo menos 10 caracteres.'
  }
  if (error.code === '23503') return 'Não foi possível salvar: registro relacionado não encontrado.'
  if (error.code === '23514') return 'Valor fora da faixa permitida.'

  return m
}

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim()
}

export function optStr(form: FormData, key: string): string | null {
  const v = str(form, key)
  return v === '' ? null : v
}

export function num(form: FormData, key: string, fallback = 0): number {
  const v = String(form.get(key) ?? '').replace(',', '.')
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
