'use client'

import { useState, useTransition } from 'react'
import { Lock, LockOpen, Pencil, Check } from 'lucide-react'
import { setCurrentYear, setTermStatus, updateTerm } from '@/lib/actions/academic'
import { Badge, type Tone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Field, Input } from '@/components/ui/field'
import { formatDate } from '@/lib/utils'

type Status = 'planned' | 'open' | 'closed'

interface Term {
  id: string
  name: string
  position: number
  status: Status
  starts_on: string | null
  ends_on: string | null
}

const STATUS_META: Record<Status, { label: string; tone: Tone }> = {
  planned: { label: 'Planejado', tone: 'slate' },
  open: { label: 'Aberto', tone: 'emerald' },
  closed: { label: 'Fechado', tone: 'amber' },
}

export function TermList({ terms }: { terms: Term[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Term | null>(null)

  function change(term: Term, status: Status) {
    setError(null)
    start(async () => {
      const r = await setTermStatus(term.id, status)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <>
      {error && (
        <p className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <ul className="divide-y divide-slate-100">
        {terms.map((term) => {
          const meta = STATUS_META[term.status]
          return (
            <li key={term.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{term.name}</span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {term.starts_on || term.ends_on
                    ? `${formatDate(term.starts_on)} — ${formatDate(term.ends_on)}`
                    : 'Sem datas definidas'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(term)}>
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>

                {term.status !== 'open' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => change(term, 'open')}
                  >
                    <LockOpen className="h-4 w-4" />
                    {term.status === 'closed' ? 'Reabrir' : 'Abrir'}
                  </Button>
                )}

                {term.status === 'open' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => change(term, 'closed')}
                  >
                    <Lock className="h-4 w-4" />
                    Fechar
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <TermEditModal term={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function TermEditModal({ term, onClose }: { term: Term | null; onClose: () => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      open={!!term}
      onClose={onClose}
      title={`Editar — ${term?.name ?? ''}`}
      description="O nome aparece nos boletins e relatórios."
    >
      {term && (
        <form
          action={(fd) => {
            fd.set('term_id', term.id)
            start(async () => {
              const r = await updateTerm(null, fd)
              if (r.ok) onClose()
              else setError(r.error)
            })
          }}
          className="space-y-4"
        >
          <Field label="Nome do período">
            <Input name="name" defaultValue={term.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Início">
              <Input type="date" name="starts_on" defaultValue={term.starts_on ?? ''} />
            </Field>
            <Field label="Fim">
              <Input type="date" name="ends_on" defaultValue={term.ends_on ?? ''} />
            </Field>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function YearSwitcher({
  years,
  currentId,
}: {
  years: { id: string; year: number; is_current: boolean }[]
  currentId: string
}) {
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">Ano letivo:</span>
      {years.map((y) => (
        <Button
          key={y.id}
          size="sm"
          variant={y.id === currentId ? 'primary' : 'secondary'}
          disabled={pending}
          onClick={() => start(() => void setCurrentYear(y.id))}
        >
          {y.id === currentId && <Check className="h-3.5 w-3.5" />}
          {y.year}
        </Button>
      ))}
    </div>
  )
}
