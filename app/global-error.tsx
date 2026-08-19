'use client'

import './globals.css'

/**
 * Última rede de segurança: pega falhas no próprio layout raiz, onde o
 * error.tsx das telas já não alcança. Precisa trazer <html> e <body> porque
 * substitui o layout inteiro, e por isso não pode depender de componentes
 * que assumam o shell da aplicação.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">
              O sistema não conseguiu carregar
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Nenhum dado foi perdido. Recarregue a página; se o problema continuar,
              avise quem cuida do sistema.
            </p>

            <button
              onClick={reset}
              className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Recarregar
            </button>

            {error.digest && (
              <p className="mt-6 text-xs text-slate-400">
                Código para diagnóstico: <code className="font-mono">{error.digest}</code>
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  )
}
