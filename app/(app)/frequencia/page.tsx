import { CalendarCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getGradingConfig } from '@/lib/data/context'
import { getClassStudents, resolveScope } from '@/lib/data/scope'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ScopePicker } from '@/components/scope-picker'
import { AttendanceGrid } from './attendance-grid'

export default async function FrequenciaPage({
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
        <PageHeader title="Frequência" />
        <Card>
          <EmptyState
            icon={<CalendarCheck className="h-10 w-10" />}
            title="Falta configurar a estrutura"
            description="Crie um ano letivo em Períodos e vincule uma disciplina a uma turma em Turmas."
          />
        </Card>
      </>
    )
  }

  const supabase = await createClient()
  const [students, config, { data: rows }] = await Promise.all([
    getClassStudents(scope.offer.classId),
    getGradingConfig(ctx.schoolId, scope.offer.id),
    supabase
      .from('term_attendance')
      .select('student_id, classes_held, absences')
      .eq('class_subject_id', scope.offer.id)
      .eq('term_id', scope.term.id),
  ])

  const existing = rows ?? []

  // O total de aulas é da turma, não do aluno: pega o maior já registrado.
  const classesHeld = existing.reduce((max, r) => Math.max(max, r.classes_held), 0)
  const absencesBy = Object.fromEntries(existing.map((r) => [r.student_id, r.absences]))

  return (
    <>
      <PageHeader
        title="Frequência"
        description="O Fechamento usa estes números: quem ficar abaixo do mínimo não recebe sugestão de ajuste de nota."
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
            icon={<CalendarCheck className="h-10 w-10" />}
            title="Nenhum aluno matriculado nesta turma"
            description="Matricule alunos na turma para lançar frequência."
          />
        </Card>
      ) : (
        <AttendanceGrid
          students={students}
          classesHeld={classesHeld}
          absencesBy={absencesBy}
          minAttendancePct={config.minAttendancePct}
          classSubjectId={scope.offer.id}
          termId={scope.term.id}
          locked={scope.locked}
        />
      )}
    </>
  )
}
