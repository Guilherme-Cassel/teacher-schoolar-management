import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getCurrentYear, getGradingConfig } from '@/lib/data/context'
import { getClassStudents } from '@/lib/data/scope'
import { buildReportCard } from '@/lib/data/report-card'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ReportControls } from './controls'
import { ReportCards } from './report-cards'
import { ConductReport } from './conduct-report'

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; tipo?: string; aluno?: string }>
}) {
  const params = await searchParams
  const ctx = (await getAppContext())!
  const { year } = await getCurrentYear(ctx.schoolId)
  const supabase = await createClient()

  const { data: classes } = year
    ? await supabase.from('classes').select('id, name').eq('school_year_id', year.id).order('name')
    : { data: [] }

  const classList = classes ?? []
  const selected = classList.find((c) => c.id === params.turma) ?? classList[0]
  const kind = params.tipo === 'conduta' ? 'conduta' : 'boletim'

  if (!year || !selected) {
    return (
      <>
        <PageHeader title="Relatórios" />
        <Card>
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="Nada para relatar ainda"
            description="Crie um ano letivo e ao menos uma turma para gerar boletins."
          />
        </Card>
      </>
    )
  }

  const [students, config] = await Promise.all([
    getClassStudents(selected.id),
    getGradingConfig(ctx.schoolId),
  ])

  const report = await buildReportCard({
    schoolId: ctx.schoolId,
    classId: selected.id,
    schoolYearId: year.id,
    students,
    config,
  })

  const onlyStudent = params.aluno
    ? report.students.filter((s) => s.student.id === params.aluno)
    : report.students

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Escolha o relatório e use Ctrl+P para salvar em PDF ou imprimir."
      />

      <ReportControls
        classes={classList}
        classId={selected.id}
        kind={kind}
        students={report.students.map((s) => ({ id: s.student.id, name: s.student.full_name }))}
        studentId={params.aluno ?? ''}
      />

      {students.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="Turma sem alunos"
            description="Matricule alunos nesta turma para gerar relatórios."
          />
        </Card>
      ) : kind === 'boletim' ? (
        <ReportCards
          data={{ ...report, students: onlyStudent }}
          config={config}
          schoolName={ctx.schoolName}
          className={selected.name}
          year={year.year}
        />
      ) : (
        <ConductReport
          data={{ ...report, students: onlyStudent }}
          schoolName={ctx.schoolName}
          className={selected.name}
          year={year.year}
        />
      )}
    </>
  )
}
