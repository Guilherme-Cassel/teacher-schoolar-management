'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { SCHOOL_COOKIE, getAppContext } from '@/lib/data/context'
import { type ActionResult, friendlyError, optStr, requireContext, str } from './_helpers'

const ONE_YEAR = 60 * 60 * 24 * 365

async function setCurrentSchool(schoolId: string) {
  const cookieStore = await cookies()
  cookieStore.set(SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR,
  })
}

/**
 * Troca o ambiente ativo.
 *
 * Redireciona sempre para /painel em vez de recarregar a tela atual: turma,
 * oferta e período viajam na querystring e pertencem à escola anterior. Manter
 * a rota faria a professora olhar uma tela montada com ids de outro ambiente —
 * ou um erro cru, ou pior, uma tela vazia que parece perda de dados.
 */
export async function switchSchool(schoolId: string): Promise<ActionResult> {
  const ctx = await requireContext()

  if (!ctx.schools.some((s) => s.id === schoolId)) {
    return { ok: false, error: 'Você não tem acesso a este ambiente.' }
  }

  await setCurrentSchool(schoolId)
  revalidatePath('/', 'layout')
  redirect('/painel')
}

/**
 * Cria um ambiente novo e entra nele.
 *
 * A escrita passa pela função create_school_with_owner (migration 0004):
 * `schools` não tem policy de INSERT, e criar o vínculo em school_members
 * exigiria ser membro de uma escola que ainda não existe.
 */
export async function createSchool(_prev: unknown, form: FormData): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const name = str(form, 'name')
  const timezone = optStr(form, 'timezone') ?? 'America/Sao_Paulo'

  if (name.length < 2) {
    return { ok: false, error: 'Informe o nome da escola (mínimo 2 caracteres).' }
  }

  const { data, error } = await supabase.rpc('create_school_with_owner', {
    p_name: name,
    p_timezone: timezone,
  })

  if (error) return { ok: false, error: friendlyError(error) }
  if (!data) return { ok: false, error: 'Não foi possível criar o ambiente.' }

  await setCurrentSchool(data as string)
  revalidatePath('/', 'layout')

  // Um ambiente sem ano letivo não abre nenhuma tela útil: manda direto para
  // o cadastro do primeiro ano, que é o próximo passo obrigatório.
  redirect('/periodos')
}

/** Renomeia o ambiente atual. */
export async function renameSchool(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const name = str(form, 'name')
  if (name.length < 2) {
    return { ok: false, error: 'Informe o nome da escola (mínimo 2 caracteres).' }
  }

  const { error } = await supabase.from('schools').update({ name }).eq('id', ctx.schoolId)
  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Lista de ambientes do usuário — usada pelo seletor e pela tela de ajustes. */
export async function listSchools() {
  const ctx = await getAppContext()
  return ctx?.schools ?? []
}
