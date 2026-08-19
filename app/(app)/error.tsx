'use client'

import { useEffect } from 'react'
import { DatabaseZap, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/**
 * Rede de segurança das telas autenticadas.
 *
 * O caso mais provável não é bug: é o Supabase indisponível — o plano gratuito
 * pausa por inatividade. Sem esta tela a professora veria o erro cru do Next e
 * concluiria que o sistema quebrou, quando o banco só está dormindo.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[erro na tela]', error)
  }, [error])

  const offline = isConnectionProblem(error)

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-lg p-8 text-center">
        <div
          className={
            offline
              ? 'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600'
              : 'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600'
          }
        >
          {offline ? <DatabaseZap className="h-6 w-6" /> : <TriangleAlert className="h-6 w-6" />}
        </div>

        <h1 className="text-lg font-semibold text-slate-900">
          {offline ? 'Não foi possível falar com o banco de dados' : 'Algo deu errado nesta tela'}
        </h1>

        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          {offline ? (
            <>
              Seus dados estão seguros — o sistema apenas não conseguiu se conectar agora.
              Isso costuma ser temporário. Tente de novo em alguns segundos.
            </>
          ) : (
            <>
              Nada foi perdido. Você pode tentar de novo; se continuar acontecendo, avise
              quem cuida do sistema.
            </>
          )}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
          <a href="/painel">
            <Button variant="secondary">Voltar ao painel</Button>
          </a>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-slate-400">
            Código para diagnóstico: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </Card>
    </div>
  )
}

/**
 * Distingue "banco fora do ar" de erro de programação. Vale a pena separar:
 * a mensagem e a expectativa da professora são completamente diferentes.
 */
function isConnectionProblem(error: Error): boolean {
  const text = `${error.message} ${error.name}`.toLowerCase()
  return (
    text.includes('fetch failed') ||
    text.includes('econnrefused') ||
    text.includes('enotfound') ||
    text.includes('etimedout') ||
    text.includes('network') ||
    text.includes('socket') ||
    text.includes('supabase')
  )
}
