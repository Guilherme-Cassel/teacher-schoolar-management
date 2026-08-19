import { redirect } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { getAppContext } from '@/lib/data/context'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getAppContext()

  if (!ctx) {
    // Autenticado, mas sem vínculo com escola: falta rodar o seed.
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="mb-2 font-semibold">Conta ainda não vinculada a uma escola</p>
          <p>
            Rode o script <code className="rounded bg-amber-100 px-1">supabase/seed/0001_seed.sql</code>{' '}
            com o UID deste usuário para criar a escola e os dados iniciais.
            O passo a passo está em <code className="rounded bg-amber-100 px-1">docs/SETUP.md</code>.
          </p>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      <AppNav schoolName={ctx.schoolName} userName={ctx.displayName ?? ctx.email} />
      <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
