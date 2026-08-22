import { ThumbsDown, ThumbsUp } from 'lucide-react'
import type { ConductDossier, DossierTerm } from '@/lib/data/conduct-report'
import { CONDUCT_BAND_LABEL, severityLabel } from '@/lib/domain/conduct'
import { Card } from '@/components/ui/card'
import { cn, formatDate, formatGrade } from '@/lib/utils'

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n)
}

function scoreTone(n: number) {
  return n > 0 ? 'text-emerald-700' : n < 0 ? 'text-rose-600' : 'text-slate-400'
}

/**
 * Dossiê de conduta de um aluno — o documento que a professora leva para a
 * reunião de pais.
 *
 * Diferente do ranking da turma, aqui o número é o resumo e as ocorrências
 * datadas é que são o conteúdo. Um pai não discute "saldo +6"; ele discute
 * "no dia 12 ele ajudou os colegas e no dia 20 não entregou a tarefa".
 */
export function ConductDossierReport({
  dossier,
  schoolName,
  className,
  year,
  decimalPlaces = 1,
}: {
  dossier: ConductDossier
  schoolName: string
  className: string
  year: number
  decimalPlaces?: number
}) {
  const { student, terms, totals } = dossier
  const withActivity = terms.filter((t) => t.occurrences.length > 0 || t.adjustments.length > 0)

  return (
    <Card className="print-sheet p-6">
      <header className="mb-5 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{schoolName}</h2>
          <span className="text-sm text-slate-500">Acompanhamento de conduta · {year}</span>
        </div>
        <p className="mt-2 text-base font-semibold text-slate-900">{student.fullName}</p>
        <p className="mt-0.5 text-sm text-slate-600">
          {[
            `Turma ${className}`,
            student.registrationCode && `Matrícula ${student.registrationCode}`,
            student.guardianName && `Responsável: ${student.guardianName}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {/* Resumo do ano */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Saldo do ano
            </p>
            <p className={cn('tabular text-2xl font-semibold', scoreTone(totals.score))}>
              {signed(totals.score)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Avaliação geral
            </p>
            <p className="text-lg font-medium text-slate-800">
              {CONDUCT_BAND_LABEL[totals.band]}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Registros
            </p>
            <p className="text-lg font-medium text-slate-800">
              <span className="text-emerald-700">{totals.praiseCount} elogio(s)</span>
              <span className="text-slate-400"> · </span>
              <span className="text-rose-600">{totals.criticismCount} crítica(s)</span>
            </p>
          </div>
        </div>

        <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600">
          Cada registro recebe um peso de 1 a 3 conforme a relevância. O saldo soma os
          elogios e desconta as críticas por esse peso. Ele acompanha o comportamento em
          sala ao longo do ano e{' '}
          <strong>não substitui a nota das avaliações</strong>.
        </p>
      </section>

      {withActivity.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          Nenhuma ocorrência registrada para este aluno em {year}.
        </p>
      ) : (
        <div className="space-y-6">
          {withActivity.map((term) => (
            <TermBlock key={term.id} term={term} decimalPlaces={decimalPlaces} />
          ))}
        </div>
      )}

      {/* Espaço de assinatura: o documento costuma ser entregue em mão. */}
      <div className="print-only mt-10 pt-4">
        <div className="flex gap-10">
          <div className="flex-1 border-t border-slate-400 pt-1 text-xs text-slate-600">
            Assinatura do professor(a)
          </div>
          <div className="flex-1 border-t border-slate-400 pt-1 text-xs text-slate-600">
            Assinatura do responsável
          </div>
        </div>
      </div>
    </Card>
  )
}

function TermBlock({ term, decimalPlaces }: { term: DossierTerm; decimalPlaces: number }) {
  return (
    // break-inside-avoid mantém um período inteiro na mesma folha quando cabe.
    <section className="break-inside-avoid">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h3 className="font-semibold text-slate-800">{term.name}</h3>
        <p className="text-sm text-slate-500">
          Saldo do período{' '}
          <span className={cn('tabular font-semibold', scoreTone(term.score))}>
            {signed(term.score)}
          </span>
          <span className="text-slate-400"> · {CONDUCT_BAND_LABEL[term.band]}</span>
        </p>
      </div>

      {term.occurrences.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {term.occurrences.map((o) => {
            const isPraise = o.type === 'praise'
            return (
              <li key={o.id} className="flex gap-3 py-2.5">
                <div
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    isPraise ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
                  )}
                >
                  {isPraise ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="tabular text-sm font-medium text-slate-500">
                      {formatDate(o.occurredOn)}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{o.category}</span>
                    <span className="text-xs text-slate-400">
                      {severityLabel(o.type, o.severity)} ({isPraise ? '+' : '−'}
                      {o.severity})
                      {o.subjectName && ` · ${o.subjectName}`}
                    </span>
                  </div>
                  {o.description && (
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                      {o.description}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {term.adjustments.map((adj, i) => (
        <div
          key={i}
          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm"
        >
          <p className="font-medium text-amber-900">
            Nota ajustada em {adj.subjectName}:{' '}
            <span className="tabular">
              {formatGrade(adj.calculatedAverage, decimalPlaces)} →{' '}
              {formatGrade(adj.finalGrade, decimalPlaces)}
            </span>
          </p>
          {adj.justification && (
            <p className="mt-1 leading-relaxed text-amber-800">{adj.justification}</p>
          )}
          <p className="mt-1 text-xs text-amber-700">
            Decidido em {formatDate(adj.decidedAt)} e registrado no sistema.
          </p>
        </div>
      ))}
    </section>
  )
}
