import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, ThumbsDown, ThumbsUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getCurrentYear, getGradingConfig } from '@/lib/data/context'
import { conductBand, CONDUCT_BAND_LABEL, severityLabel, type Severity } from '@/lib/domain/conduct'
import { ACADEMIC_STATUS_LABEL } from '@/lib/domain/grading'
import { Badge, CONDUCT_TONE, STATUS_TONE } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { cn, formatDate, formatGrade } from '@/lib/utils'

export default async function FichaAlunoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = (await getAppContext())!
  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, registration_code, birth_date, guardian_name, guardian_contact, notes, is_active')
    .eq('id', id)
    .eq('school_id', ctx.schoolId)
    .maybeSingle()

  if (!student) notFound()

  const [{ terms }, config] = await Promise.all([
    getCurrentYear(ctx.schoolId),
    getGradingConfig(ctx.schoolId),
  ])

  const [enrollmentsRes, occurrencesRes, closuresRes] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id, status, classes(id, name, shift)')
      .eq('student_id', id),
    supabase
      .from('occurrences')
      .select('id, type, category, severity, description, occurred_on, term_id')
      .eq('student_id', id)
      .order('occurred_on', { ascending: false })
      .limit(100),
    supabase
      .from('term_closures')
      .select('term_id, final_grade, calculated_average, was_adjusted, justification, decided_at, class_subject_id, class_subjects(subjects(name))')
      .eq('student_id', id),
  ])

  const enrollments = (enrollmentsRes.data ?? []) as unknown as {
    id: string
    status: string
    classes: { id: string; name: string; shift: string | null } | null
  }[]

  const occurrences = (occurrencesRes.data ?? []).map((o) => ({
    ...o,
    severity: o.severity as Severity,
    type: o.type as 'praise' | 'criticism',
  }))

  const closures = (closuresRes.data ?? []) as unknown as {
    term_id: string
    final_grade: number
    calculated_average: number
    was_adjusted: boolean
    justification: string | null
    decided_at: string
    class_subjects: { subjects: { name: string } | null } | null
  }[]

  const totalConduct = occurrences.reduce(
    (acc, o) => acc + (o.type === 'praise' ? o.severity : -o.severity),
    0,
  )
  const band = conductBand(totalConduct)
  // Relatórios são montados por turma: sem ela o link cairia na primeira da
  // lista, que pode nem ser a do aluno.
  const classId = enrollments.find((e) => e.status === 'active')?.classes?.id ?? enrollments[0]?.classes?.id ?? null
  const termName = (termId: string) => terms.find((t) => t.id === termId)?.name ?? 'Período'

  return (
    <>
      <Link href="/alunos" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 no-print">
        <ArrowLeft className="h-4 w-4" />
        Voltar para alunos
      </Link>

      <PageHeader
        title={student.full_name}
        description={[
          student.registration_code && `Matrícula ${student.registration_code}`,
          enrollments.map((e) => e.classes?.name).filter(Boolean).join(', '),
          !student.is_active && 'Inativo',
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={{
                pathname: '/relatorios',
                query: { aluno: student.id, tipo: 'boletim', ...(classId ? { turma: classId } : {}) },
              }}
            >
              <Button variant="secondary">Ver boletim</Button>
            </Link>
            <Link
              href={{
                pathname: '/relatorios',
                query: { aluno: student.id, tipo: 'historico', ...(classId ? { turma: classId } : {}) },
              }}
            >
              <Button variant="secondary">
                <FileText className="h-4 w-4" />
                Histórico de conduta
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Fechamentos registrados"
              description="A média calculada fica preservada mesmo quando a nota é ajustada."
            />

            {closures.length === 0 ? (
              <EmptyState title="Nenhum período fechado ainda para este aluno." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Período</th>
                      <th className="px-3 py-2 font-semibold">Disciplina</th>
                      <th className="px-3 py-2 text-center font-semibold">Calculada</th>
                      <th className="px-3 py-2 text-center font-semibold">Final</th>
                      <th className="px-3 py-2 font-semibold">Justificativa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closures.map((c, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5 text-slate-700">{termName(c.term_id)}</td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {c.class_subjects?.subjects?.name ?? '—'}
                        </td>
                        <td className="tabular px-3 py-2.5 text-center text-slate-500">
                          {formatGrade(Number(c.calculated_average), config.decimalPlaces)}
                        </td>
                        <td className="tabular px-3 py-2.5 text-center">
                          <span
                            className={cn(
                              'font-semibold',
                              Number(c.final_grade) >= config.passingGrade
                                ? 'text-emerald-700'
                                : 'text-rose-600',
                            )}
                          >
                            {formatGrade(Number(c.final_grade), config.decimalPlaces)}
                          </span>
                          {c.was_adjusted && (
                            <Badge tone="amber" className="ml-1.5">
                              ajustada
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {c.justification ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Linha do tempo de ocorrências"
              description={`${occurrences.length} registro(s).`}
            />

            {occurrences.length === 0 ? (
              <EmptyState title="Nenhuma ocorrência registrada." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {occurrences.map((o) => {
                  const isPraise = o.type === 'praise'
                  return (
                    <li key={o.id} className="flex gap-3 px-5 py-3">
                      <div
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          isPraise ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
                        )}
                      >
                        {isPraise ? (
                          <ThumbsUp className="h-3.5 w-3.5" />
                        ) : (
                          <ThumbsDown className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800">
                          {o.category}
                          <span className="text-slate-400">
                            {' '}
                            · {severityLabel(o.type, o.severity)} ({isPraise ? '+' : '−'}
                            {o.severity})
                          </span>
                        </p>
                        {o.description && (
                          <p className="mt-0.5 text-sm text-slate-500">{o.description}</p>
                        )}
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatDate(o.occurred_on)} · {termName(o.term_id)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Saldo de conduta
            </p>
            <p
              className={cn(
                'tabular mt-1 text-3xl font-semibold',
                totalConduct > 0
                  ? 'text-emerald-700'
                  : totalConduct < 0
                    ? 'text-rose-600'
                    : 'text-slate-400',
              )}
            >
              {totalConduct > 0 ? `+${totalConduct}` : totalConduct}
            </p>
            <Badge tone={CONDUCT_TONE[band]} className="mt-2">
              {CONDUCT_BAND_LABEL[band]}
            </Badge>
            <p className="mt-3 text-xs text-slate-500">
              {occurrences.filter((o) => o.type === 'praise').length} elogio(s) ·{' '}
              {occurrences.filter((o) => o.type === 'criticism').length} crítica(s)
            </p>
          </Card>

          <Card>
            <CardHeader title="Dados cadastrais" />
            <dl className="space-y-3 p-5 text-sm">
              <Row label="Nascimento" value={formatDate(student.birth_date)} />
              <Row label="Responsável" value={student.guardian_name ?? '—'} />
              <Row label="Contato" value={student.guardian_contact ?? '—'} />
              <Row
                label="Turmas"
                value={
                  enrollments.length
                    ? enrollments.map((e) => e.classes?.name).filter(Boolean).join(', ')
                    : 'Sem matrícula'
                }
              />
              {student.notes && <Row label="Observações" value={student.notes} />}
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{value}</dd>
    </div>
  )
}
