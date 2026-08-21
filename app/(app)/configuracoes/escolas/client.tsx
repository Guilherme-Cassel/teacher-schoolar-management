'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil, LogIn } from 'lucide-react'
import { renameSchool, switchSchool } from '@/lib/actions/schools'
import type { SchoolOption } from '@/lib/data/context'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<SchoolOption['role'], string> = {
  admin: 'Administradora',
  coordinator: 'Coordenação',
  teacher: 'Professora',
}

export function SchoolList({
  schools,
  currentId,
}: {
  schools: SchoolOption[]
  currentId: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<SchoolOption | null>(null)
  const [pending, start] = useTransition()

  function enter(id: string) {
    setError(null)
    start(async () => {
      const r = await switchSchool(id)
      if (r && !r.ok) setError(r.error)
    })
  }

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {schools.map((s) => {
          const isCurrent = s.id === currentId
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'truncate font-medium',
                      isCurrent ? 'text-brand-700' : 'text-slate-800',
                    )}
                  >
                    {s.name}
                  </p>
                  {isCurrent && (
                    <Badge tone="brand">
                      <Check className="h-3 w-3" />
                      Ativo
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{ROLE_LABEL[s.role]}</p>
              </div>

              <div className="flex shrink-0 gap-2">
                {isCurrent ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRenaming(s)}
                    disabled={pending}
                  >
                    <Pencil className="h-4 w-4" />
                    Renomear
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => enter(s.id)} disabled={pending}>
                    <LogIn className="h-4 w-4" />
                    Entrar
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {error && <p className="px-5 pb-4 text-sm text-rose-600">{error}</p>}

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renomear ambiente"
        description="Muda apenas o nome exibido. Nenhum dado é afetado."
      >
        <form
          action={(fd) =>
            start(async () => {
              const r = await renameSchool(null, fd)
              if (r.ok) {
                setRenaming(null)
                setError(null)
              } else {
                setError(r.error)
              }
            })
          }
          className="space-y-4"
        >
          <Field label="Nome da escola">
            <Input name="name" defaultValue={renaming?.name ?? ''} required minLength={2} />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
