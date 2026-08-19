import { MessageSquareWarning } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/data/context'
import { getClassStudents, resolveScope } from '@/lib/data/scope'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ScopePicker } from '@/components/scope-picker'
import { OccurrenceBoard } from './board'

export default async function OcorrenciasPage({
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
        <PageHeader title="Ocorrências" />
        <Card>
          <EmptyState
            icon={<MessageSquareWarning className="h-10 w-10" />}
            title="Falta configurar a estrutura"
            description="Crie um ano letivo em Períodos e vincule uma disciplina a uma turma em Turmas."
          />
        </Card>
      </>
    )
  }

  const supabase = await createClient()
  const students = await getClassStudents(scope.offer.classId)

  const [{ data: occurrences }, { data: conduct }] = await Promise.all([
    supabase
      .from('occurrences')
      .select('id, student_id, type, category, severity, description, occurred_on')
      .eq('term_id', scope.term.id)
      .in('student_id', students.length ? students.map((s) => s.id) : ['00000000-0000-0000-0000-000000000000'])
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('v_student_term_conduct')
      .select('student_id, conduct_score, praise_count, criticism_count')
      .eq('term_id', scope.term.id),
  ])

  const scores = new Map(
    (conduct ?? []).map((c) => [
      c.student_id,
      {
        score: c.conduct_score as number,
        praise: c.praise_count as number,
        criticism: c.criticism_count as number,
      },
    ]),
  )

  return (
    <>
      <PageHeader
        title="Ocorrências"
        description="Registre elogios e críticas em dois toques. Isso alimenta a sugestão do fechamento."
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
            icon={<MessageSquareWarning className="h-10 w-10" />}
            title="Nenhum aluno matriculado nesta turma"
            description="Matricule alunos na turma para registrar ocorrências."
          />
        </Card>
      ) : (
        <OccurrenceBoard
          students={students}
          occurrences={(occurrences ?? []).map((o) => ({
            ...o,
            severity: o.severity as 1 | 2 | 3,
            type: o.type as 'praise' | 'criticism',
          }))}
          conduct={Object.fromEntries(scores)}
          termId={scope.term.id}
          classSubjectId={scope.offer.id}
          locked={scope.locked}
        />
      )}
    </>
  )
}
