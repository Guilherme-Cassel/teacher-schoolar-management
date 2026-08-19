'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

/** Alterna entre o fechamento por período e o do ano, preservando a oferta selecionada. */
export function ClosureTabs() {
  const pathname = usePathname()
  const params = useSearchParams()
  const query = params.toString()
  const suffix = query ? `?${query}` : ''

  const tabs = [
    { href: '/fechamento', label: 'Por período' },
    { href: '/fechamento/anual', label: 'Resultado do ano' },
  ]

  return (
    <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 no-print">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${suffix}` as never}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
