import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata nota no padrão brasileiro: 6.5 -> "6,5" */
export function formatGrade(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—'
  return value.toFixed(decimals).replace('.', ',')
}

/** Converte entrada do usuário ("6,5" ou "6.5") em número. */
export function parseGrade(input: string): number | null {
  const clean = input.trim().replace(',', '.')
  if (clean === '') return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(d)
}
