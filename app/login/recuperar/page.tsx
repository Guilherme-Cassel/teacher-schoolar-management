'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, GraduationCap, Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/auth-errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

export default function RecoverPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login/redefinir`,
    })

    setLoading(false)

    // Erro de limite de tentativas é real e precisa aparecer; qualquer outro
    // vira sucesso silencioso de propósito — dizer "não existe conta com esse
    // e-mail" entregaria a estranhos quais endereços têm cadastro.
    if (error && /rate limit|only request this after/i.test(error.message)) {
      setError(translateAuthError(error.message))
      return
    }

    setSent(true)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-sm">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Recuperar senha</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enviamos um link para você criar uma senha nova.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                <MailCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="font-medium text-slate-800">Verifique seu e-mail</p>
              <p className="mt-1.5 text-sm text-slate-600">
                Se houver uma conta para <strong>{email.trim()}</strong>, o link
                de recuperação chega em instantes. Ele vale por uma hora.
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Não chegou? Confira a caixa de spam antes de pedir outro.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="E-mail da sua conta">
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

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </Button>
            </form>
          )}
        </div>

        <Link
          href="/login"
          className="mt-5 flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para o login
        </Link>
      </div>
    </main>
  )
}
