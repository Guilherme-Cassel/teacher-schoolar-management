'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, Sigma } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Alterna entre a chamada diária e o total do período.
 *
 * As duas escrevem no mesmo lugar por caminhos diferentes: a chamada alimenta
 * `term_attendance` por trigger, o total escreve nela direto. Deixar as duas
 * visíveis é o que permite migrar aos poucos — ela pode ter importado totais
 * de bimestres antigos e começar a chamada só a partir de agora.
 */
export function ModeTabs({ mode, hasLessons }: { mode: 'diaria' | 'total'; hasLessons: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function go(next: 'diaria' | 'total') {
    const q = new URLSearchParams(params.toString())
    if (next === 'total') q.set('modo', 'total')
    else q.delete('modo')
    router.replace(`${pathname}?${q.toString()}` as never)
  }

  const tabs = [
    { key: 'diaria' as const, label: 'Chamada diária', icon: CalendarDays },
    { key: 'total' as const, label: 'Total do período', icon: Sigma },
  ]

  return (
    <div className="mb-5 no-print">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = tab.key === mode
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => go(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {mode === 'total' && hasLessons && (
        <p className="mt-2 text-xs text-amber-700">
          Este período já tem chamadas registradas — os totais são calculados a
          partir delas. Editar aqui será sobrescrito na próxima chamada salva.
        </p>
      )}
    </div>
  )
}
