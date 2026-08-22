import { NextResponse } from 'next/server'
import { getAppContext, getCurrentYear } from '@/lib/data/context'
import { getTemplateContext } from '@/lib/actions/import'
import { buildTemplate } from '@/lib/import/template'

// A planilha é montada com os dados do ambiente atual, que vêm de cookie de
// sessão: nada aqui pode ser cacheado entre usuários.
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getAppContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 })
  }

  const { year } = await getCurrentYear(ctx.schoolId)
  if (!year) {
    return NextResponse.json(
      { error: 'Crie um ano letivo com períodos antes de baixar o modelo.' },
      { status: 400 },
    )
  }

  const template = await getTemplateContext()
  if (!template) {
    return NextResponse.json({ error: 'Não foi possível montar o modelo.' }, { status: 400 })
  }

  const buffer = await buildTemplate({ ...template, year: year.year })

  const slug = ctx.schoolName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="modelo-importacao-${slug}-${year.year}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
