import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { SchoolForm } from '@/components/school-form'

export const metadata = { title: 'Nova escola' }

export default function NewSchoolPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/configuracoes/escolas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para ambientes
      </Link>

      <PageHeader
        title="Nova escola"
        description="Cada escola é um ambiente separado: turmas, alunos e notas não se misturam."
      />

      <Card className="p-5">
        <SchoolForm />
      </Card>

      <p className="mt-4 text-sm text-slate-500">
        Depois de criar, o próximo passo é cadastrar o ano letivo e seus períodos.
        Você vai direto para essa tela.
      </p>
    </div>
  )
}
