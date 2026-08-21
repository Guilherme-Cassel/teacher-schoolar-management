'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, ChevronsUpDown, GraduationCap, Plus } from 'lucide-react'
import { switchSchool } from '@/lib/actions/schools'
import type { SchoolOption } from '@/lib/data/context'
import { cn } from '@/lib/utils'

export function SchoolSwitcher({
  schools,
  currentId,
  userName,
  onNavigate,
}: {
  schools: SchoolOption[]
  currentId: string
  userName: string
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  const current = schools.find((s) => s.id === currentId)

  // Clique fora e Esc fecham o painel. Sem isso, no mobile ele fica preso
  // aberto por cima da navegação e não há como voltar sem recarregar.
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(id: string) {
    if (id === currentId) {
      setOpen(false)
      return
    }
    setError(null)
    startTransition(async () => {
      // Sucesso termina em redirect, que no Next chega aqui como exceção
      // tratada — só o caminho de erro devolve um objeto.
      const result = await switchSchool(id)
      if (result && !result.ok) setError(result.error)
    })
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
          'hover:bg-slate-100 disabled:opacity-60',
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {current?.name ?? 'Minha escola'}
          </p>
          <p className="truncate text-xs text-slate-500">{userName}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg',
            'border border-slate-200 bg-white shadow-lg',
          )}
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ambientes
          </p>

          <div className="max-h-64 overflow-y-auto py-1">
            {schools.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === currentId}
                onClick={() => pick(s.id)}
                disabled={pending}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                  'hover:bg-slate-50 disabled:opacity-60',
                  s.id === currentId ? 'font-medium text-brand-700' : 'text-slate-700',
                )}
              >
                <Check
                  className={cn(
                    'h-4 w-4 shrink-0',
                    s.id === currentId ? 'text-brand-600' : 'text-transparent',
                  )}
                />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>

          <Link
            href="/configuracoes/escolas/nova"
            onClick={() => {
              setOpen(false)
              onNavigate?.()
            }}
            className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Nova escola
          </Link>
        </div>
      )}

      {error && <p className="px-2 pt-1 text-xs text-rose-600">{error}</p>}
    </div>
  )
}
