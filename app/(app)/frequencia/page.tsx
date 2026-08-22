import { CalendarCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getGradingConfig } from '@/lib/data/context'
import { getClassStudents, resolveScope } from '@/lib/data/scope'
import { getLesson, getTermLessons } from '@/lib/data/lessons'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ScopePicker } from '@/components/scope-picker'
import { AttendanceGrid } from './attendance-grid'
import { DailyRoll } from './daily-roll'
import { ModeTabs } from './mode-tabs'

/** Data de hoje no fuso da escola, no formato que o input date espera. */
function today(timezone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default async function FrequenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ oferta?: string; periodo?: string; modo?: string; data?: string }>
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

  const mode = params.modo === 'total' ? 'total' : 'diaria'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.data ?? '') ? params.data! : today()

  const supabase = await createClient()
  const [students, config, { data: rows }, lessons, lesson] = await Promise.all([
    getClassStudents(scope.offer.classId),
    getGradingConfig(ctx.schoolId, scope.offer.id),
    supabase
      .from('term_attendance')
      .select('student_id, classes_held, absences')
      .eq('class_subject_id', scope.offer.id)
      .eq('term_id', scope.term.id),
    getTermLessons(scope.offer.id, scope.term.id),
    getLesson(scope.offer.id, date),
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
        <>
          <ModeTabs mode={mode} hasLessons={lessons.length > 0} />

          {mode === 'diaria' ? (
            <DailyRoll
              // A key remonta o formulário ao trocar de dia, oferta ou período:
              // sem isso o estado de quem faltou vazaria de uma chamada para a
              // seguinte.
              key={`${scope.offer.id}:${scope.term.id}:${date}`}
              students={students}
              lessons={lessons}
              lesson={lesson}
              date={date}
              classSubjectId={scope.offer.id}
              termId={scope.term.id}
              locked={scope.locked}
            />
          ) : (
            <AttendanceGrid
              key={`${scope.offer.id}:${scope.term.id}`}
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
      )}
    </>
  )
}
