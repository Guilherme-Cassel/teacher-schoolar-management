import { redirect } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import { getAppContext, getAuthUser } from '@/lib/data/context'
import { Card } from '@/components/ui/card'
import { SchoolForm } from '@/components/school-form'

export const metadata = { title: 'Primeiro acesso' }

/**
 * Primeiro acesso: autenticada, mas ainda sem nenhum ambiente.
 *
 * Fica fora do grupo (app) de propósito — aquele layout exige um contexto de
 * escola que aqui ainda não existe, e redirecionar para dentro dele criaria
 * um laço.
 */
export default async function StartPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // Já tem ambiente: não há primeiro acesso a fazer.
  const ctx = await getAppContext()
  if (ctx) redirect('/painel')

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Vamos criar seu primeiro ambiente
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Um ambiente para cada escola em que você leciona. Os dados de uma
            não aparecem na outra.
          </p>
        </div>

        <Card className="p-5">
          <SchoolForm submitLabel="Começar" />
        </Card>

        <p className="mt-4 text-center text-xs text-slate-500">
          Entrando como {user.email}
        </p>
      </div>
    </main>
  )
}
