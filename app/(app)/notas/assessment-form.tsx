'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteAssessment, saveAssessment } from '@/lib/actions/grades'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select } from '@/components/ui/field'

interface Assessment {
  id: string
  name: string
  kind: string
  weight: number
  max_score: number
  due_date: string | null
  position: number
}

const KINDS = ['prova', 'trabalho', 'participação', 'projeto', 'seminário', 'outro']

function AssessmentFields({ assessment }: { assessment?: Assessment }) {
  return (
    <>
      <Field label="Nome da avaliação">
        <Input name="name" required autoFocus defaultValue={assessment?.name ?? ''} placeholder="Prova 1" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tipo">
          <Select name="kind" defaultValue={assessment?.kind ?? 'prova'}>
            {KINDS.map((k) => (
              <option key={k} value={k} className="capitalize">
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Peso" hint="Quanto pesa na média.">
          <Input name="weight" inputMode="decimal" defaultValue={assessment?.weight ?? 1} required />
        </Field>
        <Field label="Nota máxima" hint="Valor total.">
          <Input
            name="max_score"
            inputMode="decimal"
            defaultValue={assessment?.max_score ?? 10}
            required
          />
        </Field>
      </div>

      <Field label="Data">
        <Input name="due_date" type="date" defaultValue={assessment?.due_date ?? ''} />
      </Field>
    </>
  )
}

export function NewAssessmentButton({
  classSubjectId,
  termId,
  nextPosition,
  disabled,
}: {
  classSubjectId: string
  termId: string
  nextPosition: number
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="h-4 w-4" />
        Nova avaliação
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova avaliação"
        description="Ela vira uma coluna na grade de notas."
      >
        <form
          action={(fd) => {
            fd.set('class_subject_id', classSubjectId)
            fd.set('term_id', termId)
            fd.set('position', String(nextPosition))
            start(async () => {
              const r = await saveAssessment(null, fd)
              if (r.ok) {
                setOpen(false)
                setError(null)
              } else {
                setError(r.error)
              }
            })
          }}
          className="space-y-4"
        >
          <AssessmentFields />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Criar avaliação
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export function EditAssessmentButton({ assessment }: { assessment: Assessment }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded p-0.5 text-slate-300 hover:bg-slate-200 hover:text-slate-600"
        aria-label={`Editar ${assessment.name}`}
      >
        <Pencil className="h-3 w-3" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Editar — ${assessment.name}`}>
        <form
          action={(fd) => {
            fd.set('id', assessment.id)
            fd.set('position', String(assessment.position))
            start(async () => {
              const r = await saveAssessment(null, fd)
              if (r.ok) {
                setOpen(false)
                setError(null)
              } else {
                setError(r.error)
              }
            })
          }}
          className="space-y-4"
        >
          <AssessmentFields assessment={assessment} />

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Excluir "${assessment.name}"? As notas lançadas nela serão perdidas.`))
                  return
                start(async () => {
                  const r = await deleteAssessment(assessment.id)
                  if (r.ok) setOpen(false)
                  else setError(r.error)
                })
              }}
            >
              <Trash2 className="h-4 w-4 text-rose-500" />
              Excluir
            </Button>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}
