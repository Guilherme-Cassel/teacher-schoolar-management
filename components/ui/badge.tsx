import { cn } from '@/lib/utils'
import type { ConductBand } from '@/lib/domain/conduct'
import type { AcademicStatus } from '@/lib/domain/grading'

const TONES = {
  slate:   'bg-slate-100 text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  teal:    'bg-teal-50 text-teal-700 ring-teal-200',
  amber:   'bg-amber-50 text-amber-800 ring-amber-200',
  rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  brand:   'bg-brand-50 text-brand-700 ring-brand-200',
} as const

export type Tone = keyof typeof TONES

export function Badge({
  tone = 'slate', className, children,
}: {
  tone?: Tone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const CONDUCT_TONE: Record<ConductBand, Tone> = {
  very_positive: 'emerald',
  positive: 'teal',
  neutral: 'slate',
  attention: 'amber',
  critical: 'rose',
}

export const STATUS_TONE: Record<AcademicStatus, Tone> = {
  approved: 'emerald',
  recovery: 'amber',
  failed: 'rose',
  council_approved: 'brand',
}
