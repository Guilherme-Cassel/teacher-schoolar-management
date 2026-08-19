import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getCurrentYear } from '@/lib/data/context'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ImportButton, NewStudentButton, StudentTable } from './client'

export default async function AlunosPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; q?: string }>
}) {
  const params = await searchParams
  const ctx = (await getAppContext())!
  const { year } = await getCurrentYear(ctx.schoolId)
  const supabase = await createClient()

  const { data: classes } = year
    ? await supabase.from('classes').select('id, name').eq('school_year_id', year.id).order('name')
    : { data: [] }

  const classList = classes ?? []

  let query = supabase
    .from('students')
    .select('id, full_name, registration_code, guardian_name, guardian_contact, is_active, enrollments(id, class_id, classes(id, name))')
    .eq('school_id', ctx.schoolId)
    .order('full_name')

  if (params.q) query = query.ilike('full_name', `%${params.q}%`)

  const { data: students } = await query

  type StudentRow = {
    id: string
    full_name: string
    registration_code: string | null
    guardian_name: string | null
    guardian_contact: string | null
    is_active: boolean
    enrollments: { id: string; class_id: string; classes: { id: string; name: string } | null }[]
  }

  let list = (students ?? []) as unknown as StudentRow[]

  // O filtro por turma é aplicado aqui porque o vínculo vem de uma tabela relacionada.
  if (params.turma) {
    list = list.filter((s) => s.enrollments.some((e) => e.class_id === params.turma))
  }

  return (
    <>
      <PageHeader
        title="Alunos"
        description="Cadastro e matrícula nas turmas."
        action={
          <div className="flex gap-2">
            <ImportButton classes={classList} />
            <NewStudentButton classes={classList} />
          </div>
        }
      />

      {list.length === 0 && !params.q && !params.turma ? (
        <Card>
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="Nenhum aluno cadastrado"
            description="Importe a lista da sua planilha de uma vez, ou cadastre um por um."
            action={<ImportButton classes={classList} />}
          />
        </Card>
      ) : (
        <StudentTable
          students={list}
          classes={classList}
          activeClass={params.turma ?? ''}
          search={params.q ?? ''}
        />
      )}
    </>
  )
}
