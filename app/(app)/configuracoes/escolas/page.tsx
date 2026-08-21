import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getAppContext } from '@/lib/data/context'
import { getSchoolContents } from '@/lib/actions/schools'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SchoolList } from './client'

export const metadata = { title: 'Ambientes' }

export default async function SchoolsPage() {
  const ctx = await getAppContext()
  if (!ctx) return null

  // O que a exclusão levaria embora — mostrado antes de confirmar.
  const contents = await getSchoolContents(ctx.schoolId)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Ambientes"
        description="Cada escola em que você leciona é um espaço de dados isolado."
        action={
          <Link href="/configuracoes/escolas/nova">
            <Button>
              <Plus className="h-4 w-4" />
              Nova escola
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="Suas escolas"
          description={`${ctx.schools.length} ${ctx.schools.length === 1 ? 'ambiente' : 'ambientes'}`}
        />
        <SchoolList schools={ctx.schools} currentId={ctx.schoolId} contents={contents} />
      </Card>
    </div>
  )
}
