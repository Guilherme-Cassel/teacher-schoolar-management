'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  CalendarCheck, CalendarRange, CheckCircle2, ClipboardList, FileText,
  LayoutDashboard, LogOut, Menu, MessageSquareWarning, School, Settings, Users, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { SchoolSwitcher } from '@/components/school-switcher'
import type { SchoolOption } from '@/lib/data/context'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/painel',       label: 'Painel',      icon: LayoutDashboard },
  { href: '/notas',        label: 'Notas',       icon: ClipboardList,          scoped: true },
  { href: '/frequencia',   label: 'Frequência',  icon: CalendarCheck,          scoped: true },
  { href: '/ocorrencias',  label: 'Ocorrências', icon: MessageSquareWarning,   scoped: true },
  { href: '/fechamento',   label: 'Fechamento',  icon: CheckCircle2,           scoped: true },
  { href: '/relatorios',   label: 'Relatórios',  icon: FileText },
] as const

const NAV_CADASTROS = [
  { href: '/alunos',   label: 'Alunos',   icon: Users },
  { href: '/turmas',   label: 'Turmas',   icon: School },
  { href: '/periodos', label: 'Períodos', icon: CalendarRange },
] as const

export function AppNav({
  schools, currentSchoolId, userName,
}: {
  schools: SchoolOption[]
  currentSchoolId: string
  userName: string
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Notas, Frequência, Ocorrências e Fechamento trabalham sobre a mesma
  // turma+disciplina+período. Sem carregar a seleção, trocar de tela pelo menu
  // joga a professora de volta na oferta padrão — e ela olha o dado errado
  // achando que é o mesmo.
  const scopedQuery = (() => {
    const carried = new URLSearchParams()
    for (const key of ['oferta', 'periodo']) {
      const value = params.get(key)
      if (value) carried.set(key, value)
    }
    const qs = carried.toString()
    return qs ? `?${qs}` : ''
  })()

  const link = (item: { href: Route; label: string; icon: React.ElementType; scoped?: boolean }) => {
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={(item.scoped ? `${item.href}${scopedQuery}` : item.href) as Route}
        onClick={() => setOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    )
  }

  return (
    <>
      {/* Barra superior — só no mobile */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden no-print">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold text-slate-900">Gestão Escolar</span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <nav
        data-app-nav
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-start gap-1 border-b border-slate-200 p-2">
          <div className="min-w-0 flex-1">
            <SchoolSwitcher
              schools={schools}
              currentId={currentSchoolId}
              userName={userName}
              onNavigate={() => setOpen(false)}
            />
          </div>
          <button
            onClick={() => setOpen(false)}
            className="mt-2 rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <div className="space-y-1">{NAV.map(link)}</div>

          <div>
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Cadastros
            </p>
            <div className="space-y-1">{NAV_CADASTROS.map(link)}</div>
          </div>
        </div>

        <div className="space-y-1 border-t border-slate-200 p-3">
          {link({ href: '/configuracoes', label: 'Configurações', icon: Settings })}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </nav>
    </>
  )
}
