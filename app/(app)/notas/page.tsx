import { ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getGradingConfig } from '@/lib/data/context'
import { getClassStudents, resolveScope } from '@/lib/data/scope'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ScopePicker } from '@/components/scope-picker'
import { GradeGrid } from './grade-grid'
import { NewAssessmentButton } from './assessment-form'

export default async function NotasPage({
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
        <PageHeader title="Lançamento de notas" />
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="Falta configurar a estrutura"
            description="Crie um ano letivo em Períodos e vincule ao menos uma disciplina a uma turma em Turmas."
          />
        </Card>
      </>
    )
  }

  const supabase = await createClient()
  const [students, config, { data: assessments }] = await Promise.all([
    getClassStudents(scope.offer.classId),
    getGradingConfig(ctx.schoolId, scope.offer.id),
    supabase
      .from('assessments')
      .select('id, name, kind, weight, max_score, due_date, position')
      .eq('class_subject_id', scope.offer.id)
      .eq('term_id', scope.term.id)
      .order('position')
      .order('created_at'),
  ])

  const assessmentList = assessments ?? []

  const { data: grades } = assessmentList.length
    ? await supabase
        .from('grades')
        .select('assessment_id, student_id, score, is_absent')
        .in(
          'assessment_id',
          assessmentList.map((a) => a.id),
        )
    : { data: [] }

  return (
    <>
      <PageHeader
        title="Lançamento de notas"
        description="Digite e passe para a próxima célula: cada nota é salva sozinha."
        action={
          <NewAssessmentButton
            classSubjectId={scope.offer.id}
            termId={scope.term.id}
            nextPosition={assessmentList.length}
            disabled={scope.locked}
          />
        }
      />

      <ScopePicker
        offers={scope.offers}
        terms={scope.terms}
        offerId={scope.offer.id}
        termId={scope.term.id}
      />

      {students.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="Nenhum aluno matriculado nesta turma"
            description="Cadastre ou importe alunos e matricule-os na turma para lançar notas."
          />
        </Card>
      ) : assessmentList.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="Nenhuma avaliação neste período"
            description='Crie a primeira avaliação — por exemplo "Prova 1", peso 2.'
            action={
              <NewAssessmentButton
                classSubjectId={scope.offer.id}
                termId={scope.term.id}
                nextPosition={0}
                disabled={scope.locked}
              />
            }
          />
        </Card>
      ) : (
        <GradeGrid
          students={students}
          assessments={assessmentList}
          grades={grades ?? []}
          config={config}
          classSubjectId={scope.offer.id}
          termId={scope.term.id}
          locked={scope.locked}
        />
      )}
    </>
  )
}
