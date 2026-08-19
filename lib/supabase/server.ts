import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Com PERF_LOG=1, registra no console cada ida ao Supabase e quanto ela levou.
 * Cada round-trip custa centenas de milissegundos, então saber quantos são e
 * quais estão encadeados é o que permite diagnosticar lentidão de verdade.
 */
function instrumentedFetch(): typeof fetch | undefined {
  if (process.env.PERF_LOG !== '1') return undefined

  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const started = performance.now()
    try {
      return await fetch(input, init)
    } finally {
      const ms = Math.round(performance.now() - started)
      const short = url.replace(/^https:\/\/[^/]+/, '').slice(0, 110)
      console.log(`[perf] ${String(ms).padStart(5)}ms  ${short}`)
    }
  }
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: instrumentedFetch() },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Chamado de um Server Component: o middleware já cuida do refresh.
          }
        },
      },
    },
  )
}
