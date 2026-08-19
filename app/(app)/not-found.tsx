import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <FileQuestion className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Não encontramos esta página</h1>
        <p className="mt-2 text-sm text-slate-600">
          O aluno ou a turma que você procurava pode ter sido removido.
        </p>
        <Link href="/painel" className="mt-6 inline-block">
          <Button>Voltar ao painel</Button>
        </Link>
      </Card>
    </div>
  )
}
