import type { ReportCardData } from '@/lib/data/report-card'
import { ACADEMIC_STATUS_LABEL, type GradingConfig } from '@/lib/domain/grading'
import { CONDUCT_BAND_LABEL } from '@/lib/domain/conduct'
import { cn, formatGrade } from '@/lib/utils'

export function ReportCards({
  data,
  config,
  schoolName,
  className,
  year,
}: {
  data: ReportCardData
  config: GradingConfig
  schoolName: string
  className: string
  year: number
}) {
  return (
    <div className="space-y-6">
      {data.students.map((row) => (
        <article
          key={row.student.id}
          className="print-sheet avoid-break break-after-page rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <header className="mb-5 border-b border-slate-200 pb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{schoolName}</h2>
              <span className="text-sm text-slate-500">
                Boletim escolar · {year}
              </span>
            </div>
            <p className="mt-2 text-slate-800">
              <strong className="text-base">{row.student.full_name}</strong>
              <span className="text-slate-500">
                {' '}
                · Turma {className}
                {row.student.registration_code && ` · Matrícula ${row.student.registration_code}`}
              </span>
            </p>
          </header>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-2 text-left font-semibold text-slate-600">Disciplina</th>
                {data.terms.map((t) => (
                  <th key={t.id} className="px-2 py-2 text-center font-semibold text-slate-600">
                    {shortTerm(t.name)}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-slate-600">Média</th>
                <th className="px-2 py-2 text-center font-semibold text-slate-600">Situação</th>
              </tr>
            </thead>

            <tbody>
              {data.subjects.map((subject) => {
                const annual = row.annual[subject.classSubjectId]
                const status = row.status[subject.classSubjectId]

                return (
                  <tr key={subject.classSubjectId} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-800">{subject.subjectName}</td>

                    {data.terms.map((t) => {
                      const cell = row.cells[subject.classSubjectId]?.[t.id]
                      const value = cell?.finalGrade ?? cell?.calculatedAverage ?? null

                      return (
                        <td key={t.id} className="tabular px-2 py-2 text-center">
                          {value === null ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span
                              className={cn(
                                value < config.passingGrade ? 'text-rose-600' : 'text-slate-800',
                              )}
                            >
                              {formatGrade(value, config.decimalPlaces)}
                              {cell?.wasAdjusted && (
                                <sup className="ml-0.5 text-[10px] text-amber-600" title="Nota ajustada no fechamento">
                                  *
                                </sup>
                              )}
                            </span>
                          )}
                        </td>
                      )
                    })}

                    <td className="tabular px-2 py-2 text-center font-semibold text-slate-900">
                      {formatGrade(annual, config.decimalPlaces)}
                    </td>

                    <td className="px-2 py-2 text-center">
                      {annual === null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className={cn(
                            'text-xs font-medium',
                            status === 'approved' ? 'text-emerald-700' : 'text-rose-600',
                          )}
                        >
                          {ACADEMIC_STATUS_LABEL[status]}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
            <span>
              Conduta no ano:{' '}
              <strong className="tabular text-slate-700">
                {row.conductScore > 0 ? `+${row.conductScore}` : row.conductScore}
              </strong>{' '}
              ({CONDUCT_BAND_LABEL[row.conductBand]})
            </span>
            <span>
              Média para aprovação: {formatGrade(config.passingGrade, config.decimalPlaces)}
              {data.students.some((s) =>
                Object.values(s.cells).some((byTerm) =>
                  Object.values(byTerm).some((c) => c.wasAdjusted),
                ),
              ) && ' · * nota ajustada no fechamento'}
            </span>
          </footer>
        </article>
      ))}
    </div>
  )
}

/** "1º Bimestre" vira "1º Bim." para caber na largura do boletim. */
function shortTerm(name: string): string {
  return name
    .replace(/Bimestre/i, 'Bim.')
    .replace(/Trimestre/i, 'Tri.')
    .replace(/Semestre/i, 'Sem.')
}
