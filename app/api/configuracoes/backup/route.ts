import { NextResponse } from 'next/server'
import { getAppContext } from '@/lib/data/context'
import { buildSchoolBackup } from '@/lib/export/backup'

// Backup do ambiente da sessão: nunca pode ser cacheado entre usuários.
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getAppContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 })
  }

  const { buffer, schoolName } = await buildSchoolBackup(ctx.schoolId)

  const slug = schoolName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="backup-${slug}-${stamp}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
