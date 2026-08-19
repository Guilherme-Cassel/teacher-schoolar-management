'use client'

import { useMemo, useState, useTransition } from 'react'
import { CircleCheck, Gavel, Loader2, RotateCcw, TriangleAlert } from 'lucide-react'
import {
  reopenFinalResult,
  saveFinalResult,
  saveFinalResultsInBulk,
  type FinalResultInput,
} from '@/lib/actions/closure'
import type { AnnualRow } from '@/lib/data/annual'
import { ACADEMIC_STATUS_LABEL, type AcademicStatus, type GradingConfig } from '@/lib/domain/grading'
import { MIN_JUSTIFICATION_LENGTH } from '@/lib/domain/closure-suggestion'
import { Badge, STATUS_TONE } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Field, Textarea } from '@/components/ui/field'
import { cn, formatDate, formatGrade } from '@/lib/utils'

interface Props {
  rows: AnnualRow[]
  terms: { id: string; name: string }[]
  config: GradingConfig
  classSubjectId: string
  schoolYearId: string
}

function toInput(
  row: AnnualRow,
  status: AcademicStatus,
  notes: string | null,
  ids: { classSubjectId: string; schoolYearId: string },
): FinalResultInput {
  return {
    studentId: row.student.id,
    classSubjectId: ids.classSubjectId,
    schoolYearId: ids.schoolYearId,
    annualAverage: row.annualAverage,
    attendancePct: row.attendancePct,
    status,
    notes,
  }
}

export function AnnualTable({ rows, terms, config, classSubjectId, schoolYearId }: Props) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [council, setCouncil] = useState<AnnualRow | null>(null)

  const fechados = rows.filter((r) => r.saved).length
  const comPendencia = rows.filter((r) => r.pendingTerms > 0).length

  /** Só entram no lote quem tem todos os períodos fechados. */
  const prontos = useMemo(
    () => rows.filter((r) => !r.saved && r.pendingTerms === 0),
    [rows],
  )

  function registrar(row: AnnualRow, status: AcademicStatus, notes: string | null = null) {
    setError(null)
    start(async () => {
      const r = await saveFinalResult(
        toInput(row, status, notes, { classSubjectId, schoolYearId }),
      )
      if (!r.ok) setError(r.error)
    })
  }

  function registrarTodos() {
    setError(null)
    start(async () => {
      const r = await saveFinalResultsInBulk(
        prontos.map((row) =>
          toInput(row, row.calculatedStatus, null, { classSubjectId, schoolYearId }),
        ),
      )
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 no-print">
        <Badge tone={fechados === rows.length ? 'emerald' : 'slate'}>
          {fechados} de {rows.length} com resultado registrado
        </Badge>
        {comPendencia > 0 && (
          <Badge tone="amber">
            <TriangleAlert className="h-3 w-3" />
            {comPendencia} com período em aberto
          </Badge>
        )}
        {prontos.length > 0 && (
          <Button size="sm" variant="secondary" onClick={registrarTodos} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CircleCheck className="h-4 w-4" />
            )}
            Registrar {prontos.length} pelo cálculo
          </Button>
        )}
      </div>

      {comPendencia > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          A média anual de quem tem período em aberto é <strong>parcial</strong>: ela considera
          apenas os bimestres já fechados. Feche-os antes de registrar o resultado.
        </p>
      )}

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
                {terms.map((t) => (
                  <th key={t.id} className="px-2 py-2 text-center font-semibold">
                    {t.name.replace(/Bimestre/i, 'Bim.').replace(/Trimestre/i, 'Tri.').replace(/Semestre/i, 'Sem.')}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">Média anual</th>
                <th className="px-3 py-2 text-center font-semibold">Freq.</th>
                <th className="px-3 py-2 text-right font-semibold">Resultado</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const status = row.saved?.status ?? row.calculatedStatus
                const parcial = row.pendingTerms > 0

                return (
                  <tr key={row.student.id} className={cn(row.saved && 'bg-emerald-50/30')}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.student.full_name}</p>
                      {parcial && (
                        <p className="mt-0.5 text-xs text-amber-600">
                          {row.pendingTerms} período(s) sem fechamento
                        </p>
                      )}
                    </td>

                    {row.terms.map((cell) => (
                      <td key={cell.termId} className="tabular px-2 py-3 text-center">
                        {cell.finalGrade === null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span
                            className={
                              cell.finalGrade < config.passingGrade
                                ? 'text-rose-600'
                                : 'text-slate-700'
                            }
                          >
                            {formatGrade(cell.finalGrade, config.decimalPlaces)}
                            {cell.wasAdjusted && (
                              <sup className="ml-0.5 text-[10px] text-amber-600" title="Nota ajustada no fechamento">
                                *
                              </sup>
                            )}
                          </span>
                        )}
                      </td>
                    ))}

                    <td className="tabular px-3 py-3 text-center">
                      <span
                        className={cn(
                          'font-semibold',
                          row.annualAverage === null
                            ? 'text-slate-300'
                            : row.annualAverage >= config.passingGrade
                              ? 'text-emerald-700'
                              : 'text-rose-600',
                        )}
                      >
                        {formatGrade(row.annualAverage, config.decimalPlaces)}
                      </span>
                    </td>

                    <td className="tabular px-3 py-3 text-center">
                      {row.attendancePct === null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className={
                            row.attendancePct < config.minAttendancePct
                              ? 'font-semibold text-rose-600'
                              : 'text-slate-600'
                          }
                        >
                          {formatGrade(row.attendancePct, 0)}%
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {row.saved ? (
                        <div className="flex flex-col items-end gap-1">
                          <Badge tone={STATUS_TONE[status]}>{ACADEMIC_STATUS_LABEL[status]}</Badge>
                          {row.saved.notes && (
                            <span
                              className="max-w-xs truncate text-xs text-brand-700"
                              title={row.saved.notes}
                            >
                              {row.saved.notes}
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            {formatDate(row.saved.closedAt)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => {
                              if (!window.confirm('Reabrir o resultado deste aluno?')) return
                              start(async () => {
                                const r = await reopenFinalResult(
                                  row.student.id,
                                  classSubjectId,
                                  schoolYearId,
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
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending || row.annualAverage === null}
                              onClick={() => registrar(row, row.calculatedStatus)}
                            >
                              Registrar {ACADEMIC_STATUS_LABEL[row.calculatedStatus].toLowerCase()}
                            </Button>

                            {row.calculatedStatus !== 'approved' && row.annualAverage !== null && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => setCouncil(row)}
                              >
                                <Gavel className="h-3.5 w-3.5" />
                                Conselho
                              </Button>
                            )}
                          </div>
                          {row.annualAverage === null && (
                            <span className="text-xs text-slate-400">
                              Nenhum período fechado ainda
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <CouncilModal
        row={council}
        config={config}
        onClose={() => setCouncil(null)}
        onConfirm={(notes) => {
          if (council) registrar(council, 'council_approved', notes)
          setCouncil(null)
        }}
      />
    </>
  )
}

function CouncilModal({
  row,
  config,
  onClose,
  onConfirm,
}: {
  row: AnnualRow | null
  config: GradingConfig
  onClose: () => void
  onConfirm: (notes: string) => void
}) {
  const [notes, setNotes] = useState('')
  const curto = notes.trim().length < MIN_JUSTIFICATION_LENGTH

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title="Aprovação pelo conselho"
      description={row?.student.full_name}
    >
      {row && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Média anual{' '}
            <strong className="tabular text-slate-900">
              {formatGrade(row.annualAverage, config.decimalPlaces)}
            </strong>{' '}
            — abaixo da média de aprovação de{' '}
            {formatGrade(config.passingGrade, config.decimalPlaces)}. A aprovação pelo conselho
            contraria o cálculo, então fica registrada com seu nome, a data e o motivo.
          </div>

          <Field
            label="Justificativa do conselho"
            hint="Fica no histórico do aluno e sai no relatório."
          >
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoFocus
              placeholder="Aluno com evolução consistente ao longo do ano e frequência regular; conselho decidiu pela aprovação."
            />
          </Field>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {notes.trim().length}/{MIN_JUSTIFICATION_LENGTH} caracteres
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={curto} onClick={() => onConfirm(notes.trim())}>
                Aprovar pelo conselho
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
