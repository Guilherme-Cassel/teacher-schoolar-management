import { School } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getCurrentYear } from '@/lib/data/context'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ClassCard, NewClassButton, SubjectManager } from './client'

export default async function TurmasPage() {
  const ctx = (await getAppContext())!
  const { year } = await getCurrentYear(ctx.schoolId)
  const supabase = await createClient()

  const [{ data: subjects }, { data: classes }] = await Promise.all([
    supabase.from('subjects').select('id, name, code').eq('school_id', ctx.schoolId).order('name'),
    year
      ? supabase
          .from('classes')
          .select('id, name, shift, class_subjects(id, subject_id, subjects(id, name))')
          .eq('school_year_id', year.id)
          .order('name')
      : Promise.resolve({ data: [] as never[] }),
  ])

  const subjectList = subjects ?? []
  const classList = (classes ?? []) as unknown as {
    id: string
    name: string
    shift: string | null
    class_subjects: { id: string; subject_id: string; subjects: { id: string; name: string } }[]
  }[]

  // Quantos alunos matriculados em cada turma.
  const { data: counts } = await supabase
    .from('enrollments')
    .select('class_id')
    .eq('school_id', ctx.schoolId)
    .eq('status', 'active')

  const enrolled = new Map<string, number>()
  for (const row of counts ?? []) {
    enrolled.set(row.class_id, (enrolled.get(row.class_id) ?? 0) + 1)
  }

  return (
    <>
      <PageHeader
        title="Turmas e disciplinas"
        description={
          year
            ? `Ano letivo ${year.year}. Vincule disciplinas às turmas para poder lançar notas.`
            : 'Crie um ano letivo em Períodos antes de cadastrar turmas.'
        }
        action={year ? <NewClassButton schoolYearId={year.id} /> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {classList.length === 0 ? (
            <Card>
              <EmptyState
                icon={<School className="h-10 w-10" />}
                title="Nenhuma turma cadastrada"
                description={
                  year
                    ? 'Crie sua primeira turma, por exemplo "9º A".'
                    : 'Primeiro crie um ano letivo na tela de Períodos.'
                }
                action={year ? <NewClassButton schoolYearId={year.id} /> : undefined}
              />
            </Card>
          ) : (
            classList.map((c) => (
              <ClassCard
                key={c.id}
                klass={c}
                subjects={subjectList}
                studentCount={enrolled.get(c.id) ?? 0}
              />
            ))
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="Disciplinas" description="Usadas em todas as turmas." />
          <SubjectManager subjects={subjectList} />
        </Card>
      </div>
    </>
  )
}
