import Link from 'next/link'
import type { Route } from 'next'
import { ChevronRight, School } from 'lucide-react'
import { getAppContext } from '@/lib/data/context'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const ctx = await getAppContext()
  if (!ctx) return null

  const items: {
    href: Route
    icon: React.ElementType
    title: string
    description: string
  }[] = [
    {
      href: '/configuracoes/escolas',
      icon: School,
      title: 'Ambientes',
      description: `Trocar de escola, renomear ou criar uma nova. Hoje: ${ctx.schoolName}.`,
    },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Configurações" />

      <Card className="divide-y divide-slate-100">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{item.title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
            </Link>
          )
        })}
      </Card>
    </div>
  )
}
