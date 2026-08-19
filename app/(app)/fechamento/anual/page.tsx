import { GraduationCap } from 'lucide-react'
import { getAppContext, getCurrentYear, getGradingConfig } from '@/lib/data/context'
import { getClassStudents, resolveScope } from '@/lib/data/scope'
import { buildAnnualRows } from '@/lib/data/annual'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ScopePicker } from '@/components/scope-picker'
import { ClosureTabs } from '@/components/closure-tabs'
import { AnnualTable } from './annual-table'

export default async function FechamentoAnualPage({
  searchParams,
}: {
  searchParams: Promise<{ oferta?: string; periodo?: string }>
}) {
  const params = await searchParams
  const ctx = (await getAppContext())!
  const [scope, { year }] = await Promise.all([
    resolveScope(ctx.schoolId, params),
    getCurrentYear(ctx.schoolId),
  ])

  if (!scope.offer || !year) {
    return (
      <>
        <PageHeader title="Resultado do ano" />
        <ClosureTabs />
        <Card>
          <EmptyState
            icon={<GraduationCap className="h-10 w-10" />}
            title="Falta configurar a estrutura"
            description="Crie um ano letivo em Períodos e vincule uma disciplina a uma turma em Turmas."
          />
        </Card>
      </>
    )
  }

  const [students, config] = await Promise.all([
    getClassStudents(scope.offer.classId),
    getGradingConfig(ctx.schoolId, scope.offer.id),
  ])

  const { rows, terms } = await buildAnnualRows({
    classSubjectId: scope.offer.id,
    schoolYearId: year.id,
    students,
    config,
  })

  return (
    <>
      <PageHeader
        title={`Resultado do ano — ${year.year}`}
        description="A média anual vem dos fechamentos de período, já com as decisões que você tomou em cada um."
      />

      <ClosureTabs />

      <ScopePicker
        offers={scope.offers}
        terms={scope.terms}
        offerId={scope.offer.id}
        termId={scope.term?.id ?? null}
        showTerm={false}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GraduationCap className="h-10 w-10" />}
            title="Nenhum aluno matriculado nesta turma"
            description="Matricule alunos na turma para fechar o ano."
          />
        </Card>
      ) : (
        <AnnualTable
          key={`${scope.offer.id}:${year.id}`}
          rows={rows}
          terms={terms}
          config={config}
          classSubjectId={scope.offer.id}
          schoolYearId={year.id}
        />
      )}
    </>
  )
}
