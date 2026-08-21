import type { ReportCardData } from '@/lib/data/report-card'
import { CONDUCT_BAND_LABEL } from '@/lib/domain/conduct'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function ConductReport({
  data,
  schoolName,
  className,
  year,
}: {
  data: ReportCardData
  schoolName: string
  className: string
  year: number
}) {
  const sorted = [...data.students].sort((a, b) => b.conductScore - a.conductScore)

  return (
    <Card className="print-sheet p-6">
      <header className="mb-5 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{schoolName}</h2>
          <span className="text-sm text-slate-500">Relatório de conduta · {year}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Turma {className} · saldo = elogios menos críticas, ponderados pela severidade.
        </p>
      </header>

      <div className="scroll-x">
        <table className="w-full min-w-[26rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-2 font-semibold text-slate-600">Aluno</th>
            <th className="px-3 py-2 text-center font-semibold text-slate-600">Saldo</th>
            <th className="px-3 py-2 font-semibold text-slate-600">Faixa</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.student.id} className="border-b border-slate-100">
              <td className="py-2 font-medium text-slate-800">{row.student.full_name}</td>
              <td
                className={cn(
                  'tabular px-3 py-2 text-center font-semibold',
                  row.conductScore > 0
                    ? 'text-emerald-700'
                    : row.conductScore < 0
                      ? 'text-rose-600'
                      : 'text-slate-400',
                )}
              >
                {row.conductScore > 0 ? `+${row.conductScore}` : row.conductScore}
              </td>
              <td className="px-3 py-2 text-slate-600">{CONDUCT_BAND_LABEL[row.conductBand]}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">Nenhum aluno nesta turma.</p>
      )}
    </Card>
  )
}
