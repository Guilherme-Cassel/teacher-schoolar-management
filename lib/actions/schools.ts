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

export interface SchoolContents {
  students: number
  grades: number
  occurrences: number
  closures: number
}

/** O que existe num ambiente — o que a exclusão levaria embora. */
export async function getSchoolContents(schoolId: string): Promise<SchoolContents> {
  const ctx = await requireContext()
  if (!ctx.schools.some((s) => s.id === schoolId)) {
    return { students: 0, grades: 0, occurrences: 0, closures: 0 }
  }

  const supabase = await createClient()
  const count = (table: string) =>
    supabase.from(table).select('*', { count: 'exact', head: true }).eq('school_id', schoolId)

  const [students, grades, occurrences, closures] = await Promise.all([
    count('students'),
    count('grades'),
    count('occurrences'),
    count('term_closures'),
  ])

  return {
    students: students.count ?? 0,
    grades: grades.count ?? 0,
    occurrences: occurrences.count ?? 0,
    closures: closures.count ?? 0,
  }
}

export type DeleteSchoolResult =
  | { ok: true; deleted: { school: string; students: number; grades: number; occurrences: number } }
  | { ok: false; error: string }

/**
 * Exclui um ambiente e tudo que cascateia dele.
 *
 * A confirmação por digitação é conferida no servidor, não só na tela: um
 * clique errado é o risco pequeno: o grande é a tela ser contornada. E o nome
 * digitado é comparado com o nome real do ambiente que o cookie aponta, não
 * com um valor que o cliente mandou junto.
 */
export async function deleteSchool(
  schoolId: string,
  typedName: string,
): Promise<DeleteSchoolResult> {
  const ctx = await requireContext()

  const target = ctx.schools.find((s) => s.id === schoolId)
  if (!target) return { ok: false, error: 'Você não tem acesso a este ambiente.' }

  const normalize = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase()
  if (normalize(typedName) !== normalize(target.name)) {
    return { ok: false, error: 'O nome digitado não confere com o nome do ambiente.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_school', { p_school_id: schoolId })
  if (error) return { ok: false, error: friendlyError(error) }

  const summary = (data ?? {}) as {
    school?: string
    students?: number
    grades?: number
    occurrences?: number
  }

  // O cookie ainda aponta para o ambiente que deixou de existir. getAppContext
  // sabe cair no primeiro da lista, mas limpar aqui evita que a próxima tela
  // carregue já sabendo de um id morto.
  const cookieStore = await cookies()
  cookieStore.delete(SCHOOL_COOKIE)

  revalidatePath('/', 'layout')

  return {
    ok: true,
    deleted: {
      school: summary.school ?? target.name,
      students: summary.students ?? 0,
      grades: summary.grades ?? 0,
      occurrences: summary.occurrences ?? 0,
    },
  }
}
