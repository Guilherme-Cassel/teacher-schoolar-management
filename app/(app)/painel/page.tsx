import Link from 'next/link'
import {
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  School,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getCurrentYear, getGradingConfig } from '@/lib/data/context'
import { getClassStudents, getOffers } from '@/lib/data/scope'
import { buildClosureRows } from '@/lib/data/closure'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, formatGrade } from '@/lib/utils'

export default async function PainelPage() {
  const ctx = (await getAppContext())!
  const supabase = await createClient()

  // Tudo o que não depende um do outro sai na mesma leva.
  const [{ year, terms, openTerm }, offers, { count: studentCount }] = await Promise.all([
    getCurrentYear(ctx.schoolId),
    getOffers(ctx.schoolId),
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', ctx.schoolId)
      .eq('is_active', true),
  ])

  if (!year) {
    return (
      <>
        <PageHeader title={`Olá, ${ctx.displayName ?? 'professora'}`} />
        <Card>
          <EmptyState
            icon={<CalendarRange className="h-10 w-10" />}
            title="Vamos começar pelo ano letivo"
            description="Crie o ano letivo e seus períodos. Depois cadastre turmas, disciplinas e alunos."
            action={
              <Link href="/periodos">
                <Button>Criar ano letivo</Button>
              </Link>
            }
          />
        </Card>
      </>
    )
  }

  // Alunos na "zona de decisão" — a informação mais valiosa do painel.
  let decisionZone: {
    offerLabel: string
    offerId: string
    studentName: string
    average: number
    conductScore: number
    suggestion: string
  }[] = []

  if (openTerm) {
    // Todas as turmas em paralelo: o tempo total passa a ser o da turma mais
    // lenta, e não a soma de todas. Cada ida ao Supabase custa ~350ms.
    const perOffer = await Promise.all(
      offers.map(async (offer) => {
        const [students, config] = await Promise.all([
          getClassStudents(offer.classId),
          getGradingConfig(ctx.schoolId, offer.id),
        ])
        if (students.length === 0) return []

        const rows = await buildClosureRows({
          classSubjectId: offer.id,
          termId: openTerm.id,
          students,
          config,
        })

        return rows
          .filter((row) => !row.saved && row.analysis.suggestion !== 'none')
          .map((row) => ({
            offerLabel: `${offer.className} · ${offer.subjectName}`,
            offerId: offer.id,
            studentName: row.student.full_name,
            average: row.analysis.calculatedAverage,
            conductScore: row.analysis.conductScore,
            suggestion: row.analysis.suggestion,
          }))
      }),
    )

    decisionZone = perOffer.flat()
  }

  const decisionZoneTotal = decisionZone.length
  decisionZone = decisionZone.slice(0, 12)

  const stats = [
    { label: 'Turmas com disciplina', value: offers.length, icon: School, href: '/turmas' as const },
    { label: 'Alunos ativos', value: studentCount ?? 0, icon: Users, href: '/alunos' as const },
    { label: 'Períodos', value: terms.length, icon: CalendarRange, href: '/periodos' as const },
  ]

  return (
    <>
      <PageHeader
        title={`Olá, ${ctx.displayName ?? 'professora'}`}
        description={
          openTerm
            ? `Ano letivo ${year.year} · ${openTerm.name} aberto até ${formatDate(openTerm.ends_on)}`
            : `Ano letivo ${year.year} · nenhum período aberto`
        }
      />

      {!openTerm && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="h-5 w-5 shrink-0" />
          <span className="flex-1">
            Nenhum período está aberto, então não é possível lançar notas nem ocorrências.
          </span>
          <Link href="/periodos">
            <Button size="sm" variant="secondary">
              Abrir período
            </Button>
          </Link>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="flex items-center gap-4 p-4 transition-colors hover:border-brand-300">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="tabular text-2xl font-semibold text-slate-900">{s.value}</p>
                <p className="text-sm text-slate-500">{s.label}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title="Alunos na zona de decisão"
            description={
              openTerm
                ? `Estão perto da média no ${openTerm.name}. A conduta pesa aqui.`
                : 'Abra um período para acompanhar.'
            }
            action={
              <Link href="/fechamento">
                <Button size="sm" variant="secondary">
                  Ir ao fechamento
                </Button>
              </Link>
            }
          />

          {decisionZone.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-9 w-9" />}
              title="Nada pendente por aqui"
              description="Nenhum aluno está na faixa de ajuste no período aberto."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {decisionZone.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="font-medium text-slate-900">{d.studentName}</p>
                    <p className="text-xs text-slate-500">{d.offerLabel}</p>
                  </div>
                  <span className="tabular text-sm font-semibold text-rose-600">
                    {formatGrade(d.average)}
                  </span>
                  <Badge tone={d.conductScore > 0 ? 'emerald' : d.conductScore < 0 ? 'rose' : 'slate'}>
                    {d.conductScore > 0 ? `+${d.conductScore}` : d.conductScore}
                  </Badge>
                  <Badge
                    tone={
                      d.suggestion === 'adjust' ? 'emerald' : d.suggestion === 'keep' ? 'rose' : 'amber'
                    }
                  >
                    <Lightbulb className="h-3 w-3" />
                    {d.suggestion === 'adjust'
                      ? 'Ajustar'
                      : d.suggestion === 'keep'
                        ? 'Manter'
                        : 'Decidir'}
                  </Badge>
                </li>
              ))}
              {decisionZoneTotal > decisionZone.length && (
                <li className="px-5 py-3 text-sm text-slate-500">
                  e mais {decisionZoneTotal - decisionZone.length} aluno(s) — veja a lista
                  completa em Fechamento.
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Atalhos" />
          <div className="space-y-1 p-3">
            {[
              { href: '/notas' as const, label: 'Lançar notas', icon: ClipboardList },
              { href: '/ocorrencias' as const, label: 'Registrar ocorrência', icon: Lightbulb },
              { href: '/fechamento' as const, label: 'Fechar o período', icon: CheckCircle2 },
              { href: '/relatorios' as const, label: 'Gerar boletins', icon: ClipboardList },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
