import { redirect } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { getAppContext, getAuthUser } from '@/lib/data/context'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getAppContext()

  if (!ctx) {
    // Sem sessão o middleware já teria desviado para /login; chegar aqui
    // significa autenticada e ainda sem nenhum ambiente — criar o primeiro
    // deixou de ser tarefa de quem roda SQL e virou o primeiro acesso.
    const user = await getAuthUser()
    redirect(user ? '/comecar' : '/login')
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      <AppNav
        schools={ctx.schools}
        currentSchoolId={ctx.schoolId}
        userName={ctx.displayName ?? ctx.email}
      />
      <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
