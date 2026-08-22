import { CalendarRange } from 'lucide-react'
import Link from 'next/link'
import { getAppContext, getCurrentYear } from '@/lib/data/context'
import { Button } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ImportWizard } from './client'

export const metadata = { title: 'Importar dados' }

export default async function ImportarPage() {
  const ctx = (await getAppContext())!
  const { year, terms } = await getCurrentYear(ctx.schoolId)

  // Sem ano letivo não há período para pendurar nota nenhuma.
  if (!year || terms.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Importar dados" />
        <Card>
          <EmptyState
            icon={<CalendarRange className="h-10 w-10" />}
            title="Crie o ano letivo primeiro"
            description="A importação precisa saber a que período cada nota pertence."
            action={
              <Link href="/periodos">
                <Button>Ir para Períodos</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Importar dados"
        description={`Traga alunos, notas e frequência da sua planilha para ${ctx.schoolName} · ${year.year}.`}
      />
      <ImportWizard />
    </div>
  )
}
