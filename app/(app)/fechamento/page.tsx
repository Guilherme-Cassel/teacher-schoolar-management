import { CheckCircle2 } from 'lucide-react'
import { getAppContext, getGradingConfig } from '@/lib/data/context'
import { getClassStudents, resolveScope } from '@/lib/data/scope'
import { buildClosureRows } from '@/lib/data/closure'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ScopePicker } from '@/components/scope-picker'
import { ClosureTabs } from '@/components/closure-tabs'
import { ClosureTable } from './closure-table'

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ oferta?: string; periodo?: string }>
}) {
  const params = await searchParams
  const ctx = (await getAppContext())!
  const scope = await resolveScope(ctx.schoolId, params)

  if (!scope.offer || !scope.term) {
    return (
      <>
        <PageHeader title="Fechamento do período" />
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10" />}
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

  const rows = await buildClosureRows({
    classSubjectId: scope.offer.id,
    termId: scope.term.id,
    students,
    config,
  })

  return (
    <>
      <PageHeader
        title="Fechamento do período"
        description="Nota e conduta lado a lado. O sistema sugere; a decisão e a justificativa são suas."
      />

      <ClosureTabs />

      <ScopePicker
        offers={scope.offers}
        terms={scope.terms}
        offerId={scope.offer.id}
        termId={scope.term.id}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10" />}
            title="Nenhum aluno matriculado nesta turma"
            description="Matricule alunos na turma para fazer o fechamento."
          />
        </Card>
      ) : (
        <ClosureTable
key={`${scope.offer.id}:${scope.term.id}`}
          rows={rows}
          config={config}
          classSubjectId={scope.offer.id}
          termId={scope.term.id}
          termName={scope.term.name}
          offerLabel={`${scope.offer.className} · ${scope.offer.subjectName}`}
        />
      )}
    </>
  )
}
