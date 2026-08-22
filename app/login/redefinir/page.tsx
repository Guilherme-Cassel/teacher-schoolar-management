'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, GraduationCap, Loader2, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/auth-errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

const MIN_LENGTH = 8

type Status = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const settled = useRef(false)

  /**
   * O link do e-mail pode chegar de duas formas, dependendo do flow que o
   * projeto Supabase usa: `?code=` (PKCE) ou tokens no fragmento `#`
   * (implicit). O cliente do browser processa o fragmento sozinho, mas o
   * `code` precisa ser trocado explicitamente — e isso é assíncrono. Por isso
   * aqui escutamos onAuthStateChange em paralelo à checagem manual: o que
   * chegar primeiro decide, e um prazo curto evita ficar girando para sempre
   * quando o link é inválido.
   */
  useEffect(() => {
    function settle(next: Status, message?: string) {
      if (settled.current) return
      settled.current = true
      if (message) setError(message)
      setStatus(next)
    }

    // Ler a URL ANTES de instanciar o cliente: com detectSessionInUrl ligado
    // ele consome e limpa o fragmento assim que nasce, e o motivo do erro
    // se perderia — a tela ficaria girando sem explicar o que houve.
    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const failure = hash.get('error_description') ?? query.get('error_description')

    if (failure) {
      settle('invalid', translateAuthError(failure))
      return
    }

    const supabase = createClient()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle('ready')
    })

    const timer = setTimeout(() => settle('invalid'), 4000)

    void (async () => {
      const code = query.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        // Um code já consumido não é falha: o listener acima pode ter
        // estabelecido a sessão antes desta chamada terminar.
        if (error && !settled.current) {
          const { data } = await supabase.auth.getSession()
          if (!data.session) {
            settle('invalid', translateAuthError(error.message))
            return
          }
        }
      }

      const { data } = await supabase.auth.getSession()
      if (data.session) settle('ready')
    })()

    return () => {
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`)
      return
    }
    if (password !== confirm) {
      setError('As duas senhas não são iguais.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) {
      setError(translateAuthError(error.message))
      return
    }

    setStatus('done')
    // O link de recuperação já deixa a sessão ativa: dá para entrar direto.
    setTimeout(() => {
      router.push('/painel')
      router.refresh()
    }, 1200)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-sm">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Nova senha</h1>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {status === 'checking' && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando o link...
            </div>
          )}

          {status === 'invalid' && (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50">
                <ShieldAlert className="h-6 w-6 text-amber-600" />
              </div>
              <p className="font-medium text-slate-800">Link inválido ou expirado</p>
              <p className="mt-1.5 text-sm text-slate-600">
                {error ?? 'Links de recuperação valem por uma hora e só podem ser usados uma vez.'}
              </p>
              <Link href="/login/recuperar" className="mt-4 block">
                <Button className="w-full justify-center">Pedir um novo link</Button>
              </Link>
            </div>
          )}

          {status === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="font-medium text-slate-800">Senha alterada</p>
              <p className="mt-1.5 text-sm text-slate-600">Entrando...</p>
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Nova senha" hint={`Pelo menos ${MIN_LENGTH} caracteres.`}>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  autoFocus
                  minLength={MIN_LENGTH}
                />
              </Field>

              <Field label="Repita a nova senha">
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={MIN_LENGTH}
                />
              </Field>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full justify-center" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
