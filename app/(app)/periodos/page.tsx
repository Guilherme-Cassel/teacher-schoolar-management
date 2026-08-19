import { CalendarRange } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/data/context'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { TermList, YearSwitcher } from './term-list'
import { NewYearButton } from './new-year'

export default async function PeriodosPage() {
  const ctx = (await getAppContext())!
  const supabase = await createClient()

  const { data: years } = await supabase
    .from('school_years')
    .select('id, year, is_current, starts_on, ends_on')
    .eq('school_id', ctx.schoolId)
    .order('year', { ascending: false })

  const list = years ?? []
  const current = list.find((y) => y.is_current) ?? list[0]

  const { data: terms } = current
    ? await supabase
        .from('terms')
        .select('id, name, position, status, starts_on, ends_on')
        .eq('school_year_id', current.id)
        .order('position')
    : { data: [] }

  return (
    <>
      <PageHeader
        title="Períodos letivos"
        description="O período aberto é o único que aceita lançamento de notas e ocorrências."
        action={<NewYearButton />}
      />

      {!current ? (
        <Card>
          <EmptyState
            icon={<CalendarRange className="h-10 w-10" />}
            title="Nenhum ano letivo cadastrado"
            description="Crie o primeiro ano letivo para começar. Os bimestres são gerados automaticamente."
            action={<NewYearButton />}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {list.length > 1 && <YearSwitcher years={list} currentId={current.id} />}
          <Card>
            <CardHeader
              title={"Ano letivo " + current.year}
              description="Abra um período para lançar notas; feche para travar as alterações."
            />
            <TermList terms={terms ?? []} />
          </Card>
        </div>
      )}
    </>
  )
}
