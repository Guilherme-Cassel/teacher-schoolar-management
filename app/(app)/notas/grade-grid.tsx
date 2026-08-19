'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Lock, TriangleAlert } from 'lucide-react'
import { saveGrade } from '@/lib/actions/grades'
import {
  type AssessmentScore,
  type GradingConfig,
  calculateAverage,
} from '@/lib/domain/grading'
import { Card } from '@/components/ui/card'
import { cn, formatGrade, parseGrade } from '@/lib/utils'
import { EditAssessmentButton } from './assessment-form'

interface Student {
  id: string
  full_name: string
  registration_code: string | null
}

interface Assessment {
  id: string
  name: string
  kind: string
  weight: number
  max_score: number
  due_date: string | null
  position: number
}

interface GradeRow {
  assessment_id: string
  student_id: string
  score: number | null
  is_absent: boolean
}

type CellValue = { score: number | null; isAbsent: boolean }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const cellKey = (studentId: string, assessmentId: string) => `${studentId}:${assessmentId}`

export function GradeGrid({
  students,
  assessments,
  grades,
  config,
  locked,
}: {
  students: Student[]
  assessments: Assessment[]
  grades: GradeRow[]
  config: GradingConfig
  classSubjectId: string
  termId: string
  locked: boolean
}) {
  const [values, setValues] = useState<Record<string, CellValue>>(() => {
    const map: Record<string, CellValue> = {}
    for (const g of grades) {
      map[cellKey(g.student_id, g.assessment_id)] = {
        score: g.score === null ? null : Number(g.score),
        isAbsent: g.is_absent,
      }
    }
    return map
  })

  const [states, setStates] = useState<Record<string, SaveState>>({})
  const [errors, setErrors] = useState<string | null>(null)
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map())

  const registerInput = useCallback((key: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(key, el)
    else inputs.current.delete(key)
  }, [])

  /** Move o foco pela grade — Enter desce, setas navegam, como numa planilha. */
  function move(rowIndex: number, colIndex: number, dRow: number, dCol: number) {
    const row = Math.min(Math.max(rowIndex + dRow, 0), students.length - 1)
    const col = Math.min(Math.max(colIndex + dCol, 0), assessments.length - 1)
    const el = inputs.current.get(cellKey(students[row].id, assessments[col].id))
    el?.focus()
    el?.select()
  }

  async function persist(studentId: string, assessment: Assessment, next: CellValue) {
    const key = cellKey(studentId, assessment.id)
    setStates((s) => ({ ...s, [key]: 'saving' }))

    const r = await saveGrade({
      assessmentId: assessment.id,
      studentId,
      score: next.score,
      isAbsent: next.isAbsent,
    })

    if (r.ok) {
      setStates((s) => ({ ...s, [key]: 'saved' }))
      setErrors(null)
      setTimeout(() => setStates((s) => ({ ...s, [key]: 'idle' })), 1200)
    } else {
      setStates((s) => ({ ...s, [key]: 'error' }))
      setErrors(r.error)
    }
  }

  function commit(studentId: string, assessment: Assessment, raw: string) {
    const key = cellKey(studentId, assessment.id)
    const trimmed = raw.trim()

    // "F", "-" ou "falta" marcam ausência.
    const isAbsent = /^(f|falta|-)$/i.test(trimmed)
    const score = isAbsent ? null : parseGrade(trimmed)

    if (!isAbsent && trimmed !== '' && score === null) {
      setErrors(`"${trimmed}" não é uma nota válida.`)
      return
    }
    if (score !== null && (score < 0 || score > assessment.max_score)) {
      setErrors(
        `A nota de "${assessment.name}" deve ficar entre 0 e ${formatGrade(assessment.max_score)}.`,
      )
      return
    }

    const prev = values[key]
    const next: CellValue = { score, isAbsent }
    if (prev?.score === next.score && prev?.isAbsent === next.isAbsent) return
    if (!prev && score === null && !isAbsent) return

    setValues((v) => ({ ...v, [key]: next }))
    void persist(studentId, assessment, next)
  }

  const averages = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateAverage>>()
    for (const s of students) {
      const scores: AssessmentScore[] = assessments.map((a) => {
        const v = values[cellKey(s.id, a.id)]
        return {
          weight: Number(a.weight),
          maxScore: Number(a.max_score),
          score: v?.score ?? null,
          isAbsent: v?.isAbsent ?? false,
        }
      })
      map.set(s.id, calculateAverage(scores, config))
    }
    return map
  }, [students, assessments, values, config])

  const totalWeight = assessments.reduce((acc, a) => acc + Number(a.weight), 0)

  return (
    <Card className="overflow-hidden">
      {locked && (
        <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <Lock className="h-4 w-4" />
          Este período está fechado. Reabra-o em Períodos para alterar notas.
        </p>
      )}

      {errors && (
        <p className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {errors}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 min-w-52 border-b border-r border-slate-200 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Aluno
              </th>
              {assessments.map((a) => (
                <th
                  key={a.id}
                  className="min-w-24 border-b border-slate-200 px-2 py-2 text-center align-bottom"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-semibold text-slate-700">{a.name}</span>
                    {!locked && <EditAssessmentButton assessment={a} />}
                  </div>
                  <div className="mt-0.5 text-xs font-normal text-slate-400">
                    peso {formatGrade(Number(a.weight))} · máx {formatGrade(Number(a.max_score))}
                  </div>
                </th>
              ))}
              <th className="min-w-24 border-b border-l border-slate-200 bg-brand-50/60 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-brand-700">
                Média
              </th>
            </tr>
          </thead>

          <tbody>
            {students.map((student, rowIndex) => {
              const avg = averages.get(student.id)
              return (
                <tr key={student.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-1.5 group-hover:bg-slate-50">
                    <span className="font-medium text-slate-800">{student.full_name}</span>
                    {student.registration_code && (
                      <span className="ml-2 text-xs text-slate-400">
                        {student.registration_code}
                      </span>
                    )}
                  </td>

                  {assessments.map((a, colIndex) => {
                    const key = cellKey(student.id, a.id)
                    const value = values[key]
                    const state = states[key] ?? 'idle'
                    const display = value?.isAbsent
                      ? 'F'
                      : value?.score !== null && value?.score !== undefined
                        ? formatGrade(value.score, countDecimals(value.score))
                        : ''

                    return (
                      <td
                        key={a.id}
                        className="relative border-b border-slate-100 p-0 group-hover:bg-slate-50"
                      >
                        <input
                          ref={(el) => registerInput(key, el)}
                          defaultValue={display}
                          key={display}
                          disabled={locked}
                          inputMode="decimal"
                          aria-label={`${a.name} de ${student.full_name}`}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={(e) => commit(student.id, a, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            const el = e.currentTarget
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commit(student.id, a, el.value)
                              move(rowIndex, colIndex, e.shiftKey ? -1 : 1, 0)
                            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                              e.preventDefault()
                              commit(student.id, a, el.value)
                              move(rowIndex, colIndex, e.key === 'ArrowDown' ? 1 : -1, 0)
                            } else if (e.key === 'Escape') {
                              el.value = display
                              el.blur()
                            }
                          }}
                          className={cn(
                            'tabular h-9 w-full bg-transparent px-2 text-center outline-none',
                            'focus:bg-brand-50 focus:ring-2 focus:ring-inset focus:ring-brand-500',
                            'disabled:cursor-not-allowed',
                            value?.isAbsent && 'font-semibold text-rose-600',
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
                    )
                  })}

                  <td className="tabular border-b border-l border-slate-200 bg-brand-50/40 px-3 py-1.5 text-center font-semibold text-slate-800">
                    {avg?.average === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span
                        className={cn(
                          avg && avg.average! < config.passingGrade
                            ? 'text-rose-600'
                            : 'text-emerald-700',
                        )}
                      >
                        {formatGrade(avg?.average ?? null, config.decimalPlaces)}
                      </span>
                    )}
                    {avg && avg.pending > 0 && (
                      <span
                        className="ml-1 text-xs font-normal text-amber-600"
                        title={`${avg.pending} avaliação(ões) sem nota`}
                      >
                        ·{avg.pending}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        <span>
          <kbd className="rounded border border-slate-300 bg-white px-1">Enter</kbd> desce ·{' '}
          <kbd className="rounded border border-slate-300 bg-white px-1">Tab</kbd> avança ·{' '}
          <kbd className="rounded border border-slate-300 bg-white px-1">F</kbd> marca falta ·{' '}
          <kbd className="rounded border border-slate-300 bg-white px-1">Esc</kbd> desfaz
        </span>
        <span>
          {students.length} alunos · {assessments.length} avaliações · peso total{' '}
          {formatGrade(totalWeight)}
        </span>
      </div>
    </Card>
  )
}

/** Mostra a nota como foi digitada: 7 fica "7", 7.5 fica "7,5". */
function countDecimals(n: number): number {
  return Number.isInteger(n) ? 0 : 1
}

