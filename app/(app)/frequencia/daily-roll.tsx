'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, Trash2, UserRoundCheck, UserRoundX } from 'lucide-react'
import { deleteLesson, saveLesson } from '@/lib/actions/lessons'
import type { LessonDetail, LessonSummary } from '@/lib/data/lessons'
import type { StudentBrief } from '@/lib/data/scope'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select } from '@/components/ui/field'
import { cn, formatDate } from '@/lib/utils'

export function DailyRoll({
  students,
  lessons,
  lesson,
  date,
  classSubjectId,
  termId,
  locked,
}: {
  students: StudentBrief[]
  lessons: LessonSummary[]
  lesson: LessonDetail | null
  date: string
  classSubjectId: string
  termId: string
  locked: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Ausências desta chamada. Começa do que está gravado; ao trocar de dia,
  // o componente é remontado pela key na página e o estado nasce de novo.
  //
  // As duas listas saem do mesmo objeto, mas leem coisas diferentes: a CHAVE
  // diz que o aluno faltou, o VALOR diz se a falta foi justificada. Usar o
  // valor nas duas faria a falta não justificada (valor false) reaparecer
  // como presença ao reabrir a chamada.
  const [absent, setAbsent] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(lesson?.absences ?? {}).map((id) => [id, true])),
  )
  const [justified, setJustified] = useState<Record<string, boolean>>(
    () => lesson?.absences ?? {},
  )

  // Trocar de data recarrega a chamada pelo servidor; enquanto isso o aviso
  // de "salvo" some, para não parecer que o novo dia já foi gravado.
  useEffect(() => setSaved(false), [date])

  function goToDate(next: string) {
    const q = new URLSearchParams(params.toString())
    q.set('data', next)
    router.replace(`${pathname}?${q.toString()}` as never)
  }

  function toggle(studentId: string) {
    setSaved(false)
    setAbsent((prev) => ({ ...prev, [studentId]: !prev[studentId] }))
  }

  const absentIds = students.filter((s) => absent[s.id]).map((s) => s.id)
  const presentCount = students.length - absentIds.length

  function submit(form: FormData) {
    form.set('class_subject_id', classSubjectId)
    form.set('term_id', termId)
    form.set('lesson_date', date)
    for (const id of absentIds) {
      form.append('ausente', id)
      if (justified[id]) form.append('justificada', id)
    }

    start(async () => {
      const r = await saveLesson(null, form)
      if (r.ok) {
        setError(null)
        setSaved(true)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <Card>
        <CardHeader
          title="Chamada do dia"
          description={
            lesson
              ? `Aula de ${formatDate(date)} já registrada — editar substitui a chamada.`
              : 'Marque quem faltou. Quem não for marcado conta como presente.'
          }
          action={
            <Badge tone={absentIds.length > 0 ? 'amber' : 'emerald'}>
              {presentCount}/{students.length} presentes
            </Badge>
          }
        />

        <form action={submit}>
          <div className="grid gap-4 border-b border-slate-200 px-5 py-4 sm:grid-cols-3">
            <Field label="Data da aula">
              <Input
                type="date"
                value={date}
                onChange={(e) => e.target.value && goToDate(e.target.value)}
                disabled={locked}
              />
            </Field>

            <Field label="Aulas no dia" hint="Aula dupla vale 2 faltas.">
              <Select name="periods" defaultValue={String(lesson?.periods ?? 1)} disabled={locked}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'aula' : 'aulas'}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Conteúdo (opcional)">
              <Input
                name="topic"
                defaultValue={lesson?.topic ?? ''}
                placeholder="Equação do 2º grau"
                disabled={locked}
              />
            </Field>
          </div>

          <ul className="divide-y divide-slate-100">
            {students.map((student) => {
              const isAbsent = !!absent[student.id]
              return (
                <li
                  key={student.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 px-5 py-2.5',
                    isAbsent && 'bg-rose-50/50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{student.full_name}</p>
                    {isAbsent && (
                      <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={!!justified[student.id]}
                          onChange={(e) =>
                            setJustified((p) => ({ ...p, [student.id]: e.target.checked }))
                          }
                          disabled={locked}
                          className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                        Falta justificada
                      </label>
                    )}
                  </div>

                  {/* Alvo de toque grande: isto é usado em pé, em sala. */}
                  <button
                    type="button"
                    onClick={() => toggle(student.id)}
                    disabled={locked}
                    aria-pressed={isAbsent}
                    className={cn(
                      // Mais alto no celular: é onde a chamada é feita, em pé
                      // e com uma mão só.
                      'inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-lg sm:h-10',
                      'text-sm font-medium transition-colors disabled:opacity-50',
                      isAbsent
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100',
                    )}
                  >
                    {isAbsent ? (
                      <>
                        <UserRoundX className="h-4 w-4" />
                        Faltou
                      </>
                    ) : (
                      <>
                        <UserRoundCheck className="h-4 w-4" />
                        Presente
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {error && <p className="px-5 pt-3 text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
            {saved && !pending && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <Check className="h-4 w-4" />
                Chamada salva
              </span>
            )}
            <Button type="submit" disabled={pending || locked}>
              {pending ? 'Salvando...' : lesson ? 'Atualizar chamada' : 'Salvar chamada'}
            </Button>
          </div>
        </form>
      </Card>

      <LessonHistory
        lessons={lessons}
        currentDate={date}
        locked={locked}
        onPick={goToDate}
      />
    </div>
  )
}

function LessonHistory({
  lessons,
  currentDate,
  locked,
  onPick,
}: {
  lessons: LessonSummary[]
  currentDate: string
  locked: boolean
  onPick: (date: string) => void
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  const totalPeriods = lessons.reduce((acc, l) => acc + l.periods, 0)

  return (
    <Card className="h-fit">
      <CardHeader
        title="Aulas do período"
        description={
          lessons.length === 0
            ? 'Nenhuma ainda.'
            : `${lessons.length} chamada(s) · ${totalPeriods} aula(s) dadas`
        }
      />

      {lessons.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-500">
          Ao salvar a primeira chamada, o total de aulas e as faltas de cada
          aluno passam a ser calculados a partir daqui.
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {lessons.map((l) => (
            <li
              key={l.id}
              className={cn(
                'flex items-center justify-between gap-2 px-4 py-2.5',
                l.date === currentDate && 'bg-brand-50',
              )}
            >
              <button
                type="button"
                onClick={() => onPick(l.date)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="tabular text-sm font-medium text-slate-800">
                  {formatDate(l.date)}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {l.periods} {l.periods === 1 ? 'aula' : 'aulas'} ·{' '}
                  {l.absentCount === 0 ? 'ninguém faltou' : `${l.absentCount} falta(s)`}
                  {l.topic && ` · ${l.topic}`}
                </p>
              </button>

              {!locked && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Excluir a chamada de ${formatDate(l.date)}?`)) return
                    start(async () => {
                      await deleteLesson(l.id)
                      router.refresh()
                    })
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Excluir chamada de ${formatDate(l.date)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
