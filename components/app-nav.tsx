'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  CalendarRange, CheckCircle2, ClipboardList, FileText, GraduationCap,
  LayoutDashboard, LogOut, Menu, MessageSquareWarning, School, Users, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/painel',       label: 'Painel',      icon: LayoutDashboard },
  { href: '/notas',        label: 'Notas',       icon: ClipboardList },
  { href: '/ocorrencias',  label: 'Ocorrências', icon: MessageSquareWarning },
  { href: '/fechamento',   label: 'Fechamento',  icon: CheckCircle2 },
  { href: '/relatorios',   label: 'Relatórios',  icon: FileText },
] as const

const NAV_CADASTROS = [
  { href: '/alunos',   label: 'Alunos',   icon: Users },
  { href: '/turmas',   label: 'Turmas',   icon: School },
  { href: '/periodos', label: 'Períodos', icon: CalendarRange },
] as const

export function AppNav({
  schoolName, userName,
}: {
  schoolName: string
  userName: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const link = (item: { href: Route; label: string; icon: React.ElementType }) => {
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={item.href}
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
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{schoolName}</p>
            <p className="truncate text-xs text-slate-500">{userName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
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

        <div className="border-t border-slate-200 p-3">
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
