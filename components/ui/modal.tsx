'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Modal sobre o <dialog> nativo: já traz foco preso, Esc para fechar
 * e camada superior sem z-index. Zero dependências.
 */
export function Modal({
  open, onClose, title, description, children, className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        // O preflight do Tailwind zera o `margin: auto` que o navegador usa para
        // centralizar o dialog modal, então a centralização é reposta aqui.
        'fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] overflow-y-auto',
        'w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 p-0 shadow-xl',
        'backdrop:bg-slate-900/40 open:animate-none',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  )
}
