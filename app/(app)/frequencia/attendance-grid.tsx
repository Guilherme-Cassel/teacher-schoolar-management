'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { Check, Loader2, Lock, TriangleAlert } from 'lucide-react'
import { saveAttendance, setClassesHeld as setClassesHeldAction } from '@/lib/actions/grades'
import { attendancePercent } from '@/lib/domain/grading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { cn, formatGrade } from '@/lib/utils'

interface Student {
  id: string
  full_name: string
  registration_code: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function AttendanceGrid({
  students,
  classesHeld: initialClassesHeld,
  absencesBy: initialAbsences,
  minAttendancePct,
  classSubjectId,
  termId,
  locked,
}: {
  students: Student[]
  classesHeld: number
  absencesBy: Record<string, number>
  minAttendancePct: number
  classSubjectId: string
  termId: string
  locked: boolean
}) {
  const [classesHeld, setClassesHeld] = useState(initialClassesHeld)
  const [draftClasses, setDraftClasses] = useState(String(initialClassesHeld || ''))
  const [absences, setAbsences] = useState<Record<string, number>>(initialAbsences)
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const inputs = useRef<Map<string, HTMLInputElement>>(new Map())
  const register = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(id, el)
    else inputs.current.delete(id)
  }, [])

  function applyClassesHeld() {
    const total = Number(draftClasses)
    if (!Number.isInteger(total) || total < 0) {
      setError('Informe um número inteiro de aulas.')
      return
    }

    const excedentes = students.filter((s) => (absences[s.id] ?? 0) > total)
    if (excedentes.length > 0) {
      const nomes = excedentes.map((s) => s.full_name.split(' ')[0]).join(', ')
      if (
        !confirm(
          `${excedentes.length} aluno(s) têm mais faltas que ${total} aulas (${nomes}). ` +
            'As faltas deles serão limitadas a esse total. Continuar?',
        )
      ) {
        return
      }
    }

    setError(null)
    start(async () => {
      const r = await setClassesHeldAction({
        classSubjectId,
        termId,
        studentIds: students.map((s) => s.id),
        classesHeld: total,
      })
      if (r.ok) {
        setClassesHeld(total)
        setAbsences((prev) => {
          const next = { ...prev }
          for (const s of students) next[s.id] = Math.min(next[s.id] ?? 0, total)
          return next
        })
      } else {
        setError(r.error)
      }
    })
  }

  function commitAbsences(student: Student, raw: string) {
    const value = raw.trim() === '' ? 0 : Number(raw)

    if (!Number.isInteger(value) || value < 0) {
      setError(`"${raw}" não é um número de faltas válido.`)
      return
    }
    if (value > classesHeld) {
      setError(
        `${student.full_name} não pode ter ${value} faltas em ${classesHeld} aulas dadas.`,
      )
      return
    }
    if ((absences[student.id] ?? 0) === value) return

    setError(null)
    setAbsences((prev) => ({ ...prev, [student.id]: value }))
    setStates((s) => ({ ...s, [student.id]: 'saving' }))

    void (async () => {
      const r = await saveAttendance({
        studentId: student.id,
        classSubjectId,
        termId,
        classesHeld,
        absences: value,
      })
      if (r.ok) {
        setStates((s) => ({ ...s, [student.id]: 'saved' }))
        setTimeout(() => setStates((s) => ({ ...s, [student.id]: 'idle' })), 1200)
      } else {
        setStates((s) => ({ ...s, [student.id]: 'error' }))
        setError(r.error)
      }
    })()
  }

  function move(index: number, delta: number) {
    const next = Math.min(Math.max(index + delta, 0), students.length - 1)
    const el = inputs.current.get(students[next].id)
    el?.focus()
    el?.select()
  }

  const semAulas = classesHeld === 0
  const abaixoDoMinimo = students.filter((s) => {
    const pct = attendancePercent(classesHeld, absences[s.id] ?? 0)
    return pct !== null && pct < minAttendancePct
  }).length

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Aulas dadas no período
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Vale para a turma inteira. É a base do cálculo de presença.
            </p>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={draftClasses}
              disabled={locked}
              onChange={(e) => setDraftClasses(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyClassesHeld()}
              className="max-w-32"
            />
          </div>

          <Button onClick={applyClassesHeld} disabled={pending || locked}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar à turma
          </Button>
        </div>
      </Card>

      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <Card className="overflow-hidden">
        {locked && (
          <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <Lock className="h-4 w-4" />
            Este período está fechado. Reabra-o em Períodos para alterar a frequência.
          </p>
        )}

        {semAulas ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Informe primeiro quantas aulas foram dadas no período — sem isso não há como
            calcular a presença.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Aluno</th>
                  <th className="px-3 py-2 text-center font-semibold">Faltas</th>
                  <th className="px-3 py-2 text-center font-semibold">Presenças</th>
                  <th className="px-3 py-2 text-center font-semibold">Frequência</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {students.map((student, index) => {
                  const faltas = absences[student.id] ?? 0
                  const pct = attendancePercent(classesHeld, faltas)
                  const reprovado = pct !== null && pct < minAttendancePct
                  const state = states[student.id] ?? 'idle'

                  return (
                    <tr key={student.id} className={cn(reprovado && 'bg-rose-50/40')}>
                      <td className="px-4 py-1.5">
                        <span className="font-medium text-slate-800">{student.full_name}</span>
                        {student.registration_code && (
                          <span className="ml-2 text-xs text-slate-400">
                            {student.registration_code}
                          </span>
                        )}
                      </td>

                      <td className="relative w-28 p-0">
                        <input
                          ref={(el) => register(student.id, el)}
                          key={faltas}
                          defaultValue={faltas}
                          disabled={locked}
                          inputMode="numeric"
                          aria-label={`Faltas de ${student.full_name}`}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={(e) => commitAbsences(student, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                              e.preventDefault()
                              commitAbsences(student, e.currentTarget.value)
                              move(index, e.key === 'ArrowUp' || e.shiftKey ? -1 : 1)
                            }
                          }}
                          className={cn(
                            'tabular h-9 w-full bg-transparent px-2 text-center outline-none',
                            'focus:bg-brand-50 focus:ring-2 focus:ring-inset focus:ring-brand-500',
                            state === 'error' && 'bg-rose-50',
                          )}
                        />
                        {state === 'saving' && (
                          <Loader2 className="pointer-events-none absolute right-1 top-1 h-3 w-3 animate-spin text-slate-400" />
                        )}
                        {state === 'saved' && (
                          <Check className="pointer-events-none absolute right-1 top-1 h-3 w-3 text-emerald-500" />
                        )}
                      </td>

                      <td className="tabular px-3 py-1.5 text-center text-slate-500">
                        {classesHeld - faltas}
                      </td>

                      <td className="px-3 py-1.5 text-center">
                        <Badge tone={reprovado ? 'rose' : pct !== null && pct < 85 ? 'amber' : 'emerald'}>
                          {formatGrade(pct, 0)}%
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!semAulas && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            <span>
              <kbd className="rounded border border-slate-300 bg-white px-1">Enter</kbd> desce ·
              mínimo exigido: {formatGrade(minAttendancePct, 0)}%
            </span>
            <span className={cn(abaixoDoMinimo > 0 && 'font-medium text-rose-600')}>
              {abaixoDoMinimo === 0
                ? 'Nenhum aluno abaixo do mínimo'
                : `${abaixoDoMinimo} aluno(s) abaixo do mínimo`}
            </span>
          </div>
        )}
      </Card>
    </div>
  )
}
