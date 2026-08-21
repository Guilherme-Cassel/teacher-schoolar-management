import { FileText, UserSearch } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getCurrentYear, getGradingConfig } from '@/lib/data/context'
import { getClassStudents } from '@/lib/data/scope'
import { buildReportCard } from '@/lib/data/report-card'
import { buildConductDossier } from '@/lib/data/conduct-report'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ReportControls } from './controls'
import { ReportCards } from './report-cards'
import { ConductReport } from './conduct-report'
import { ConductDossierReport } from './conduct-dossier'

type ReportKind = 'boletim' | 'conduta' | 'historico'

function parseKind(value: string | undefined): ReportKind {
  if (value === 'conduta' || value === 'historico') return value
  return 'boletim'
}

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
  const kind = parseKind(params.tipo)

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

  // O histórico é sempre de UM aluno: é um documento de conversa individual
  // com a família, não um comparativo entre colegas.
  const dossier =
    kind === 'historico' && params.aluno
      ? await buildConductDossier({
          schoolId: ctx.schoolId,
          studentId: params.aluno,
          schoolYearId: year.id,
        })
      : null

  const header = (
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
    </>
  )

  if (students.length === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="Turma sem alunos"
            description="Matricule alunos nesta turma para gerar relatórios."
          />
        </Card>
      </>
    )
  }

  return (
    <>
      {header}

      {kind === 'boletim' && (
        <ReportCards
          data={{ ...report, students: onlyStudent }}
          config={config}
          schoolName={ctx.schoolName}
          className={selected.name}
          year={year.year}
        />
      )}

      {kind === 'conduta' && (
        <ConductReport
          data={{ ...report, students: onlyStudent }}
          schoolName={ctx.schoolName}
          className={selected.name}
          year={year.year}
        />
      )}

      {kind === 'historico' &&
        (dossier ? (
          <ConductDossierReport
            dossier={dossier}
            schoolName={ctx.schoolName}
            className={selected.name}
            year={year.year}
            decimalPlaces={config.decimalPlaces}
          />
        ) : (
          <Card>
            <EmptyState
              icon={<UserSearch className="h-10 w-10" />}
              title="Escolha um aluno"
              description="O histórico de conduta é individual: selecione o aluno no filtro acima para ver as ocorrências com data e o que foi registrado em cada uma."
            />
          </Card>
        ))}
    </>
  )
}
