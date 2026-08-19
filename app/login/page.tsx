'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GraduationCap, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message,
      )
      setLoading(false)
      return
    }

    // typedRoutes exige rota literal; aqui o destino vem da query string.
    const next = params.get('next')
    const target = next && next.startsWith('/') ? next : '/painel'
    router.push(target as Parameters<typeof router.push>[0])
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="E-mail">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          autoFocus
          placeholder="professora@escola.com"
        />
      </Field>

      <Field label="Senha">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-sm">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Gestão Escolar</h1>
          <p className="mt-1 text-sm text-slate-500">
            Notas, ocorrências e fechamento em um só lugar.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
