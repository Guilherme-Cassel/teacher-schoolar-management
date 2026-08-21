'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import {
  ChevronDown,
  CircleCheck,
  Lightbulb,
  Loader2,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from 'lucide-react'
import {
  confirmClosuresInBulk,
  reopenClosure,
  saveClosureDecision,
  type DecisionInput,
} from '@/lib/actions/closure'
import type { ClosureRow } from '@/lib/data/closure'
import { ACADEMIC_STATUS_LABEL, type GradingConfig } from '@/lib/domain/grading'
import { CONDUCT_BAND_LABEL, severityLabel } from '@/lib/domain/conduct'
import {
  MIN_JUSTIFICATION_LENGTH,
  SUGGESTION_LABEL,
} from '@/lib/domain/closure-suggestion'
import { Badge, CONDUCT_TONE, STATUS_TONE } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Textarea } from '@/components/ui/field'
import { cn, formatDate, formatGrade, parseGrade } from '@/lib/utils'

interface Props {
  rows: ClosureRow[]
  config: GradingConfig
  classSubjectId: string
  termId: string
  termName: string
  offerLabel: string
}

function toDecision(row: ClosureRow, finalGrade: number, justification: string | null, ids: { classSubjectId: string; termId: string }): DecisionInput {
  return {
    studentId: row.student.id,
    classSubjectId: ids.classSubjectId,
    termId: ids.termId,
    calculatedAverage: row.analysis.calculatedAverage,
    conductScore: row.analysis.conductScore,
    attendancePct: row.analysis.attendancePct,
    suggestion: row.analysis.suggestion,
    finalGrade,
    justification,
  }
}

export function ClosureTable({ rows, config, classSubjectId, termId, termName, offerLabel }: Props) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<ClosureRow | null>(null)

  const decided = rows.filter((r) => r.saved).length
  const inDecisionZone = rows.filter((r) => !r.saved && r.analysis.suggestion !== 'none')
  const withPending = rows.filter((r) => r.pending > 0).length

  /** Alunos que podem ser confirmados em lote: nada a decidir e nada pendente. */
  const bulkReady = useMemo(
    () => rows.filter((r) => !r.saved && r.analysis.suggestion === 'none' && r.pending === 0),
    [rows],
  )

  function confirm(row: ClosureRow, grade: number) {
    setError(null)
    start(async () => {
      const r = await saveClosureDecision(
        toDecision(row, grade, null, { classSubjectId, termId }),
      )
      if (!r.ok) setError(r.error)
    })
  }

  function confirmAll() {
    setError(null)
    start(async () => {
      const r = await confirmClosuresInBulk(
        bulkReady.map((row) =>
          toDecision(row, row.analysis.calculatedAverage, null, { classSubjectId, termId }),
        ),
      )
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 no-print">
        <Badge tone={decided === rows.length ? 'emerald' : 'slate'}>
          {decided} de {rows.length} fechados
        </Badge>
        {inDecisionZone.length > 0 && (
          <Badge tone="amber">
            <Lightbulb className="h-3 w-3" />
            {inDecisionZone.length} na zona de decisão
          </Badge>
        )}
        {withPending > 0 && (
          <Badge tone="rose">
            <TriangleAlert className="h-3 w-3" />
            {withPending} com nota faltando
          </Badge>
        )}

        {bulkReady.length > 0 && (
          <Button size="sm" variant="secondary" onClick={confirmAll} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
            Confirmar {bulkReady.length} sem pendência
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Aluno</th>
                <th className="px-3 py-2 text-center font-semibold">Média</th>
                <th className="px-3 py-2 text-center font-semibold">Conduta</th>
                <th className="px-3 py-2 text-center font-semibold">Freq.</th>
                <th className="px-3 py-2 font-semibold">Sugestão do sistema</th>
                <th className="px-3 py-2 text-right font-semibold">Decisão</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const a = row.analysis
                const open = expanded === row.student.id
                const highlight = !row.saved && a.suggestion !== 'none'

                return (
                  <Fragment key={row.student.id}>
                    <tr
                      className={cn(
                        highlight && 'bg-amber-50/40',
                        row.saved && 'bg-emerald-50/30',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.student.full_name}</p>
                        {row.pending > 0 && (
                          <p className="mt-0.5 text-xs text-rose-600">
                            {row.pending} avaliação(ões) sem nota
                          </p>
                        )}
                      </td>

                      <td className="tabular px-3 py-3 text-center">
                        <span
                          className={cn(
                            'font-semibold',
                            a.calculatedAverage >= config.passingGrade
                              ? 'text-emerald-700'
                              : 'text-rose-600',
                          )}
                        >
                          {formatGrade(a.calculatedAverage, config.decimalPlaces)}
                        </span>
                        {a.gap > 0 && a.gap <= config.adjustTolerance && (
                          <span className="ml-1 text-xs text-amber-600">
                            −{formatGrade(a.gap, 1)}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : row.student.id)}
                          className="inline-flex items-center gap-1"
                          aria-expanded={open}
                        >
                          <Badge tone={CONDUCT_TONE[a.conductBand]} className="tabular">
                            {a.conductScore > 0 ? `+${a.conductScore}` : a.conductScore}
                          </Badge>
                          {row.occurrences.length > 0 && (
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 text-slate-400 transition-transform',
                                open && 'rotate-180',
                              )}
                            />
                          )}
                        </button>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {CONDUCT_BAND_LABEL[a.conductBand]}
                        </p>
                      </td>

                      <td className="tabular px-3 py-3 text-center">
                        {a.attendancePct === null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={a.attendanceBelowMinimum ? 'font-semibold text-rose-600' : 'text-slate-600'}>
                            {formatGrade(a.attendancePct, 0)}%
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {row.saved ? (
                          <span className="text-xs text-slate-500">
                            Fechado em {formatDate(row.saved.decidedAt)}
                          </span>
                        ) : (
                          <>
                            <Badge
                              tone={
                                a.suggestion === 'adjust'
                                  ? 'emerald'
                                  : a.suggestion === 'keep'
                                    ? 'rose'
                                    : a.suggestion === 'free_choice'
                                      ? 'amber'
                                      : 'slate'
                              }
                            >
                              {SUGGESTION_LABEL[a.suggestion]}
                            </Badge>
                            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                              {a.reason}
                            </p>
                          </>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right">
                        {row.saved ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                              <span className="tabular text-base font-semibold text-slate-900">
                                {formatGrade(row.saved.finalGrade, config.decimalPlaces)}
                              </span>
                              <Badge tone={STATUS_TONE[statusOf(row, config)]}>
                                {ACADEMIC_STATUS_LABEL[statusOf(row, config)]}
                              </Badge>
                            </div>
                            {row.saved.wasAdjusted && (
                              <span
                                className="max-w-xs truncate text-xs text-amber-700"
                                title={row.saved.justification ?? ''}
                              >
                                Ajustada de{' '}
                                {formatGrade(row.saved.calculatedAverage, config.decimalPlaces)}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                if (!confirm_('Reabrir o fechamento deste aluno?')) return
                                start(async () => {
                                  const r = await reopenClosure(
                                    row.student.id,
                                    classSubjectId,
                                    termId,
                                  )
                                  if (!r.ok) setError(r.error)
                                })
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reabrir
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant={a.suggestion === 'keep' ? 'primary' : 'secondary'}
                              disabled={pending}
                              onClick={() => confirm(row, a.calculatedAverage)}
                            >
                              Manter {formatGrade(a.calculatedAverage, config.decimalPlaces)}
                            </Button>

                            {a.suggestion !== 'none' && (
                              <Button
                                size="sm"
                                variant={a.suggestion === 'adjust' ? 'primary' : 'secondary'}
                                disabled={pending}
                                onClick={() => setAdjusting(row)}
                              >
                                Ajustar
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {open && row.occurrences.length > 0 && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={6} className="px-4 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Ocorrências que formam o saldo
                          </p>
                          <ul className="grid gap-1.5 sm:grid-cols-2">
                            {row.occurrences.map((o) => (
                              <li key={o.id} className="flex items-start gap-2 text-sm">
                                {o.type === 'praise' ? (
                                  <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                ) : (
                                  <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                                )}
                                <span className="text-slate-700">
                                  {o.category}
                                  <span className="text-slate-400">
                                    {' '}
                                    · {severityLabel(o.type, o.severity)} (
                                    {o.type === 'praise' ? '+' : '−'}
                                    {o.severity}) · {formatDate(o.occurred_on)}
                                  </span>
                                  {o.description && (
                                    <span className="block text-xs text-slate-500">
                                      {o.description}
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AdjustModal
        row={adjusting}
        config={config}
        classSubjectId={classSubjectId}
        termId={termId}
        context={`${offerLabel} — ${termName}`}
        onClose={() => setAdjusting(null)}
        onError={setError}
      />
    </>
  )
}

/** `confirm` global do navegador, renomeado para não colidir com a função local. */
function confirm_(message: string): boolean {
  return window.confirm(message)
}

function statusOf(row: ClosureRow, config: GradingConfig) {
  const grade = row.saved?.finalGrade ?? row.analysis.calculatedAverage
  if (row.analysis.attendanceBelowMinimum) return 'failed' as const
  if (grade >= config.passingGrade) return 'approved' as const
  return config.hasRecovery ? ('recovery' as const) : ('failed' as const)
}

function AdjustModal({
  row,
  config,
  classSubjectId,
  termId,
  context,
  onClose,
  onError,
}: {
  row: ClosureRow | null
  config: GradingConfig
  classSubjectId: string
  termId: string
  context: string
  onClose: () => void
  onError: (message: string | null) => void
}) {
  const [pending, start] = useTransition()
  const [grade, setGrade] = useState('')
  const [justification, setJustification] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const suggested = row?.analysis.suggestedGrade ?? config.passingGrade
  const value = grade === '' ? suggested : parseGrade(grade)
  const tooShort = justification.trim().length < MIN_JUSTIFICATION_LENGTH

  function submit() {
    if (!row) return
    if (value === null) {
      setLocalError('Informe uma nota válida.')
      return
    }
    if (tooShort) {
      setLocalError(
        `A justificativa precisa ter pelo menos ${MIN_JUSTIFICATION_LENGTH} caracteres.`,
      )
      return
    }

    start(async () => {
      const r = await saveClosureDecision(
        toDecision(row, value, justification.trim(), { classSubjectId, termId }),
      )
      if (r.ok) {
        setGrade('')
        setJustification('')
        setLocalError(null)
        onError(null)
        onClose()
      } else {
        setLocalError(r.error)
      }
    })
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title="Ajustar nota do período"
      description={row ? `${row.student.full_name} — ${context}` : undefined}
    >
      {row && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="text-slate-600">
                Média calculada:{' '}
                <strong className="tabular text-slate-900">
                  {formatGrade(row.analysis.calculatedAverage, config.decimalPlaces)}
                </strong>
              </span>
              <span className="text-slate-600">
                Conduta:{' '}
                <strong className="tabular text-slate-900">
                  {row.analysis.conductScore > 0
                    ? `+${row.analysis.conductScore}`
                    : row.analysis.conductScore}
                </strong>{' '}
                ({CONDUCT_BAND_LABEL[row.analysis.conductBand]})
              </span>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-slate-600">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              {row.analysis.reason}
            </p>
          </div>

          <Field label="Nota final" hint="A média calculada continua registrada para consulta.">
            <Input
              inputMode="decimal"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder={formatGrade(suggested, config.decimalPlaces)}
              autoFocus
            />
          </Field>

          <Field
            label="Justificativa"
            hint="Fica registrada com seu nome e a data. Obrigatória para qualquer ajuste."
            error={localError}
          >
            <Textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Aluno participativo, entregou todos os trabalhos e melhorou ao longo do bimestre."
            />
          </Field>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {justification.trim().length}/{MIN_JUSTIFICATION_LENGTH} caracteres
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={pending || tooShort}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar decisão
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
