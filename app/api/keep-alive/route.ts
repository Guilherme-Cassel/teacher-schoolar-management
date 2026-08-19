import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Ping diário para impedir que o Supabase pause o projeto por inatividade.
 *
 * O plano gratuito pausa após ~7 dias sem consultas. O uso de uma professora é
 * sazonal — muito movimento na semana de fechamento, semanas de silêncio entre
 * um bimestre e outro —, exatamente o padrão que dispara a pausa.
 *
 * Agendado em vercel.json. Também serve como health check manual.
 */

// Nunca cachear: uma resposta em cache não tocaria o banco, que é o objetivo.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // A Vercel injeta este cabeçalho automaticamente quando CRON_SECRET existe.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
    }
  }

  const started = Date.now()

  // Cliente sem cookies: o ping não tem sessão nem precisa de uma.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )

  const { data, error } = await supabase.rpc('health_check')
  const ms = Date.now() - started

  if (error) {
    console.error('[keep-alive] falhou:', error.message)
    return NextResponse.json(
      { ok: false, error: error.message, ms },
      { status: 503 },
    )
  }

  return NextResponse.json({ ok: true, db: data, ms })
}
