'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { BookOpen, Plus, Trash2, Users, X } from 'lucide-react'
import {
  addClassSubject,
  createClass,
  createSubject,
  deleteClass,
  deleteSubject,
  removeClassSubject,
} from '@/lib/actions/registry'
import type { GradingConfig } from '@/lib/domain/grading'
import { SubjectRulesButton } from './subject-rules'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'

interface Subject {
  id: string
  name: string
  code?: string | null
}

interface Klass {
  id: string
  name: string
  shift: string | null
  class_subjects: { id: string; subject_id: string; subjects: { id: string; name: string } }[]
}

export function NewClassButton({ schoolYearId }: { schoolYearId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nova turma
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Nova turma">
        <form
          action={(fd) => {
            fd.set('school_year_id', schoolYearId)
            start(async () => {
              const r = await createClass(null, fd)
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
          <Field label="Nome da turma" hint='Por exemplo: "9º A" ou "3ª série B".'>
            <Input name="name" required autoFocus placeholder="9º A" />
          </Field>
          <Field label="Turno">
            <Select name="shift" defaultValue="">
              <option value="">Não informar</option>
              <option value="manhã">Manhã</option>
              <option value="tarde">Tarde</option>
              <option value="noite">Noite</option>
              <option value="integral">Integral</option>
            </Select>
          </Field>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Criar turma
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export interface GradingConfigMap {
  schoolDefault: GradingConfig
  /** Só as ofertas que fugiram do padrão. */
  byOffer: Record<string, GradingConfig>
}

export function ClassCard({
  klass,
  subjects,
  studentCount,
  configs,
}: {
  klass: Klass
  subjects: Subject[]
  studentCount: number
  configs: GradingConfigMap
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const linked = new Set(klass.class_subjects.map((cs) => cs.subject_id))
  const available = subjects.filter((s) => !linked.has(s.id))

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">{klass.name}</h2>
          <p className="mt-0.5 flex items-center gap-3 text-sm text-slate-500">
            {klass.shift && <span className="capitalize">{klass.shift}</span>}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {studentCount} {studentCount === 1 ? 'aluno' : 'alunos'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={{ pathname: '/alunos', query: { turma: klass.id } }}>
            <Button size="sm" variant="secondary">
              Ver alunos
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Excluir a turma "${klass.name}"? Notas e matrículas dela serão perdidas.`)) return
              start(async () => {
                const r = await deleteClass(klass.id)
                if (!r.ok) setError(r.error)
              })
            }}
            aria-label="Excluir turma"
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
          </Button>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Disciplinas desta turma
        </p>

        {klass.class_subjects.length === 0 && (
          <p className="mb-3 text-sm text-slate-500">
            Nenhuma disciplina vinculada ainda — sem isso não é possível lançar notas.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {klass.class_subjects.map((cs) => (
            <span
              key={cs.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-200"
            >
              {cs.subjects.name}
              <SubjectRulesButton
                classSubjectId={cs.id}
                subjectName={cs.subjects.name}
                className={klass.name}
                config={configs.byOffer[cs.id] ?? configs.schoolDefault}
                hasOwn={cs.id in configs.byOffer}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await removeClassSubject(cs.id)
                    if (!r.ok) setError(r.error)
                  })
                }
                className="rounded-full p-0.5 text-brand-400 hover:bg-brand-100 hover:text-brand-700"
                aria-label={`Remover ${cs.subjects.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}

          {available.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" />
              Vincular disciplina
            </Button>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Vincular disciplina — ${klass.name}`}
      >
        <form
          action={(fd) => {
            fd.set('class_id', klass.id)
            start(async () => {
              const r = await addClassSubject(null, fd)
              if (r.ok) setAdding(false)
              else setError(r.error)
            })
          }}
          className="space-y-4"
        >
          <Field label="Disciplina">
            <Select name="subject_id" required>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Vincular
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}

export function SubjectManager({ subjects }: { subjects: Subject[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="p-4">
      <form
        action={(fd) =>
          start(async () => {
            const r = await createSubject(null, fd)
            if (r.ok) {
              setError(null)
              ;(document.getElementById('new-subject') as HTMLInputElement | null)?.form?.reset()
            } else {
              setError(r.error)
            }
          })
        }
        className="mb-4 flex gap-2"
      >
        <Input id="new-subject" name="name" placeholder="Nova disciplina" required />
        <Button type="submit" size="icon" disabled={pending} aria-label="Adicionar disciplina">
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {subjects.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <BookOpen className="h-4 w-4" />
          Nenhuma disciplina ainda.
        </p>
      ) : (
        <ul className="space-y-1">
          {subjects.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              <span className="text-slate-700">{s.name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteSubject(s.id)
                    if (!r.ok) setError(r.error)
                  })
                }
                className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Excluir ${s.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {subjects.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          <Badge tone="slate">{subjects.length}</Badge> disciplina
          {subjects.length === 1 ? '' : 's'} cadastrada{subjects.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}
