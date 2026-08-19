'use client'

import { useMemo, useState, useTransition } from 'react'
import { Lock, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { createOccurrence, deleteOccurrence } from '@/lib/actions/occurrences'
import {
  CRITICISM_CATEGORIES,
  PRAISE_CATEGORIES,
  SEVERITY_LABEL,
  conductBand,
  type Severity,
} from '@/lib/domain/conduct'
import { Badge, CONDUCT_TONE } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Field, Select, Textarea, Input } from '@/components/ui/field'
import { cn, formatDate } from '@/lib/utils'

interface Student {
  id: string
  full_name: string
  registration_code: string | null
}

interface Occurrence {
  id: string
  student_id: string
  type: 'praise' | 'criticism'
  category: string
  severity: Severity
  description: string | null
  occurred_on: string
}

interface ConductInfo {
  score: number
  praise: number
  criticism: number
}

export function OccurrenceBoard({
  students,
  occurrences,
  conduct,
  termId,
  classSubjectId,
  locked,
}: {
  students: Student[]
  occurrences: Occurrence[]
  conduct: Record<string, ConductInfo>
  termId: string
  classSubjectId: string
  locked: boolean
}) {
  const [target, setTarget] = useState<{ student: Student; type: 'praise' | 'criticism' } | null>(null)
  const [filter, setFilter] = useState<string>('')

  const byStudent = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of students) map.set(s.id, s.full_name)
    return map
  }, [students])

  const visible = filter ? occurrences.filter((o) => o.student_id === filter) : occurrences

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <Card className="h-fit">
        <CardHeader
          title="Registrar ocorrência"
          description="Toque no polegar ao lado do aluno."
        />

        {locked && (
          <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <Lock className="h-4 w-4" />
            Período fechado — não é possível registrar novas ocorrências.
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {students.map((s) => {
            const info = conduct[s.id]
            const score = info?.score ?? 0
            const band = conductBand(score)

            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setFilter(filter === s.id ? '' : s.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate text-left text-sm font-medium',
                    filter === s.id ? 'text-brand-700' : 'text-slate-800 hover:text-brand-700',
                  )}
                >
                  {s.full_name}
                </button>

                <Badge tone={CONDUCT_TONE[band]} className="tabular shrink-0">
                  {score > 0 ? `+${score}` : score}
                </Badge>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setTarget({ student: s, type: 'praise' })}
                    className="rounded-lg p-2 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-30"
                    aria-label={`Registrar elogio para ${s.full_name}`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setTarget({ student: s, type: 'criticism' })}
                    className="rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-30"
                    aria-label={`Registrar crítica para ${s.full_name}`}
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="h-fit">
        <CardHeader
          title="Histórico do período"
          description={
            filter
              ? `Filtrado por ${byStudent.get(filter) ?? 'aluno'}.`
              : `${occurrences.length} registro(s).`
          }
          action={
            filter ? (
              <Button size="sm" variant="ghost" onClick={() => setFilter('')}>
                Limpar filtro
              </Button>
            ) : undefined
          }
        />

        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Nenhuma ocorrência registrada ainda.
          </p>
        ) : (
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {visible.map((o) => (
              <OccurrenceItem
                key={o.id}
                occurrence={o}
                studentName={byStudent.get(o.student_id) ?? '—'}
                locked={locked}
              />
            ))}
          </ul>
        )}
      </Card>

      <OccurrenceModal
        target={target}
        termId={termId}
        classSubjectId={classSubjectId}
        onClose={() => setTarget(null)}
      />
    </div>
  )
}

function OccurrenceItem({
  occurrence,
  studentName,
  locked,
}: {
  occurrence: Occurrence
  studentName: string
  locked: boolean
}) {
  const [pending, start] = useTransition()
  const isPraise = occurrence.type === 'praise'

  return (
    <li className="flex gap-3 px-4 py-3">
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isPraise ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
        )}
      >
        {isPraise ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsDown className="h-3.5 w-3.5" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{studentName}</p>
        <p className="text-sm text-slate-600">
          {occurrence.category}
          <span className="text-slate-400">
            {' '}
            · {SEVERITY_LABEL[occurrence.severity]} ({isPraise ? '+' : '−'}
            {occurrence.severity})
          </span>
        </p>
        {occurrence.description && (
          <p className="mt-0.5 text-sm text-slate-500">{occurrence.description}</p>
        )}
        <p className="mt-0.5 text-xs text-slate-400">{formatDate(occurrence.occurred_on)}</p>
      </div>

      {!locked && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm('Excluir esta ocorrência?')) return
            start(() => void deleteOccurrence(occurrence.id))
          }}
          className="h-fit rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
          aria-label="Excluir ocorrência"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  )
}

function OccurrenceModal({
  target,
  termId,
  classSubjectId,
  onClose,
}: {
  target: { student: Student; type: 'praise' | 'criticism' } | null
  termId: string
  classSubjectId: string
  onClose: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isPraise = target?.type === 'praise'
  const categories = isPraise ? PRAISE_CATEGORIES : CRITICISM_CATEGORIES
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={isPraise ? 'Registrar elogio' : 'Registrar crítica'}
      description={target?.student.full_name}
    >
      {target && (
        <form
          key={target.student.id + target.type}
          action={(fd) => {
            fd.set('student_id', target.student.id)
            fd.set('term_id', termId)
            fd.set('class_subject_id', classSubjectId)
            fd.set('type', target.type)
            start(async () => {
              const r = await createOccurrence(null, fd)
              if (r.ok) {
                setError(null)
                onClose()
              } else {
                setError(r.error)
              }
            })
          }}
          className="space-y-4"
        >
          <Field label="Categoria">
            <Select name="category" required autoFocus>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Severidade"
            hint={
              isPraise
                ? 'Quanto este elogio pesa no saldo de conduta.'
                : 'Quanto esta crítica pesa no saldo de conduta.'
            }
          >
            <Select name="severity" defaultValue="1">
              <option value="1">Leve ({isPraise ? '+1' : '−1'})</option>
              <option value="2">Moderada ({isPraise ? '+2' : '−2'})</option>
              <option value="3">Grave ({isPraise ? '+3' : '−3'})</option>
            </Select>
          </Field>

          <Field label="Data">
            <Input type="date" name="occurred_on" defaultValue={today} />
          </Field>

          <Field label="Descrição" hint="Opcional, mas ajuda a lembrar no fechamento.">
            <Textarea
              name="description"
              rows={2}
              placeholder={
                isPraise
                  ? 'Ajudou os colegas na atividade em grupo.'
                  : 'Conversou durante toda a explicação.'
              }
            />
          </Field>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant={isPraise ? 'success' : 'danger'} disabled={pending}>
              {isPraise ? 'Registrar elogio' : 'Registrar crítica'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
