'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, friendlyError, num, optStr, requireContext, str } from './_helpers'

/** Cria um ano letivo já com os períodos (bimestres/trimestres/semestres). */
export async function createSchoolYear(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const year = num(form, 'year')
  const divisions = num(form, 'divisions', 4)
  const startsOn = optStr(form, 'starts_on')
  const endsOn = optStr(form, 'ends_on')

  if (year < 2000 || year > 2100) return { ok: false, error: 'Informe um ano válido.' }
  if (![2, 3, 4].includes(divisions)) return { ok: false, error: 'Escolha 2, 3 ou 4 períodos.' }

  const { data: created, error } = await supabase
    .from('school_years')
    .insert({ school_id: ctx.schoolId, year, starts_on: startsOn, ends_on: endsOn })
    .select('id')
    .single()

  if (error) return { ok: false, error: friendlyError(error) }

  const noun = divisions === 2 ? 'Semestre' : divisions === 3 ? 'Trimestre' : 'Bimestre'
  const terms = Array.from({ length: divisions }, (_, i) => ({
    school_id: ctx.schoolId,
    school_year_id: created.id,
    name: `${i + 1}º ${noun}`,
    position: i + 1,
    status: i === 0 ? 'open' : 'planned',
  }))

  const { error: termError } = await supabase.from('terms').insert(terms)
  if (termError) return { ok: false, error: friendlyError(termError) }

  revalidatePath('/periodos')
  return { ok: true }
}

/** Abrir, fechar ou reabrir um período. Fechar trava o lançamento de notas. */
export async function setTermStatus(
  termId: string,
  status: 'planned' | 'open' | 'closed',
): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const { error } = await supabase.from('terms').update({ status }).eq('id', termId)
  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/periodos')
  revalidatePath('/notas')
  revalidatePath('/fechamento')
  return { ok: true }
}

export interface YearContents {
  terms: number
  classes: number
  assessments: number
  grades: number
  occurrences: number
  closures: number
}

/** O que existe dentro de um ano letivo — o que a exclusão levaria embora. */
export async function getYearContents(yearId: string): Promise<YearContents> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const [termsRes, classesRes] = await Promise.all([
    supabase.from('terms').select('id').eq('school_year_id', yearId).eq('school_id', ctx.schoolId),
    supabase.from('classes').select('id').eq('school_year_id', yearId).eq('school_id', ctx.schoolId),
  ])

  const termIds = (termsRes.data ?? []).map((t) => t.id)
  const classIds = (classesRes.data ?? []).map((c) => c.id)

  const empty = {
    terms: termIds.length,
    classes: classIds.length,
    assessments: 0,
    grades: 0,
    occurrences: 0,
    closures: 0,
  }

  if (termIds.length === 0 && classIds.length === 0) return empty

  // Notas e frequência penduram na oferta (turma + disciplina), não no ano.
  const { data: offers } = classIds.length
    ? await supabase.from('class_subjects').select('id').in('class_id', classIds)
    : { data: [] }

  const offerIds = (offers ?? []).map((o) => o.id)

  const [assessments, occurrences, closures] = await Promise.all([
    offerIds.length
      ? supabase
          .from('assessments')
          .select('id', { count: 'exact', head: true })
          .in('class_subject_id', offerIds)
      : Promise.resolve({ count: 0 }),
    termIds.length
      ? supabase
          .from('occurrences')
          .select('*', { count: 'exact', head: true })
          .in('term_id', termIds)
      : Promise.resolve({ count: 0 }),
    termIds.length
      ? supabase
          .from('term_closures')
          .select('*', { count: 'exact', head: true })
          .in('term_id', termIds)
      : Promise.resolve({ count: 0 }),
  ])

  // As notas exigem os ids das avaliações; só busca se houver alguma.
  let grades = 0
  if (offerIds.length) {
    const { data: assessmentRows } = await supabase
      .from('assessments')
      .select('id')
      .in('class_subject_id', offerIds)

    const assessmentIds = (assessmentRows ?? []).map((a) => a.id)
    if (assessmentIds.length) {
      const { count } = await supabase
        .from('grades')
        .select('*', { count: 'exact', head: true })
        .in('assessment_id', assessmentIds)
      grades = count ?? 0
    }
  }

  return {
    ...empty,
    assessments: assessments.count ?? 0,
    grades,
    occurrences: occurrences.count ?? 0,
    closures: closures.count ?? 0,
  }
}

/**
 * Exclui um ano letivo e tudo que cascateia dele.
 *
 * Perde-se o ano inteiro: períodos, turmas, ofertas, avaliações, notas,
 * frequência, ocorrências, fechamentos e o resultado final. O caso comum é
 * inocente — criar 4 bimestres quando eram 3 trimestres e querer refazer —
 * mas o mesmo botão apaga um ano de trabalho, então a confirmação por
 * digitação vale sempre que houver qualquer dado dentro.
 *
 * Diferente da exclusão de ambiente, aqui não é preciso função no banco:
 * school_years já tem policy de RLS `for all`, que cobre DELETE.
 */
export async function deleteSchoolYear(
  yearId: string,
  typedYear: string,
): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data: year } = await supabase
    .from('school_years')
    .select('id, year')
    .eq('id', yearId)
    .eq('school_id', ctx.schoolId)
    .maybeSingle()

  if (!year) return { ok: false, error: 'Ano letivo não encontrado neste ambiente.' }

  const contents = await getYearContents(yearId)
  const hasData =
    contents.classes > 0 ||
    contents.assessments > 0 ||
    contents.grades > 0 ||
    contents.occurrences > 0 ||
    contents.closures > 0

  // Ano recém-criado e ainda vazio não precisa de cerimônia: só os períodos
  // gerados junto com ele existem, e refazer é o motivo mais provável.
  if (hasData && typedYear.trim() !== String(year.year)) {
    return { ok: false, error: `Digite ${year.year} para confirmar a exclusão.` }
  }

  const { error } = await supabase.from('school_years').delete().eq('id', yearId)
  if (error) return { ok: false, error: friendlyError(error) }

  // Se o ano excluído era o corrente, o mais recente que sobrou assume — sem
  // isso a escola fica sem ano marcado e as telas caem no estado vazio mesmo
  // havendo anos cadastrados.
  const { data: remaining } = await supabase
    .from('school_years')
    .select('id, is_current')
    .eq('school_id', ctx.schoolId)
    .order('year', { ascending: false })

  const list = remaining ?? []
  if (list.length > 0 && !list.some((y) => y.is_current)) {
    await supabase.from('school_years').update({ is_current: true }).eq('id', list[0].id)
  }

  for (const path of ['/periodos', '/painel', '/notas', '/frequencia', '/fechamento', '/relatorios', '/turmas']) {
    revalidatePath(path)
  }

  return { ok: true }
}

export async function setCurrentYear(yearId: string): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  await supabase.from('school_years').update({ is_current: false }).eq('school_id', ctx.schoolId)
  const { error } = await supabase.from('school_years').update({ is_current: true }).eq('id', yearId)
  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/periodos')
  return { ok: true }
}

/**
 * Edita nome e datas do período.
 *
 * Renomear e ajustar datas eram ações separadas, e a de renomear nunca chegou
 * a ganhar tela — ficou escrita e sem chamador. Como as duas se editam no
 * mesmo lugar, viraram uma escrita só: uma ida ao banco em vez de duas, e
 * nada de código órfão.
 */
export async function updateTerm(
  _prev: unknown,
  form: FormData,
): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const name = str(form, 'name')
  if (!name) return { ok: false, error: 'Informe o nome do período.' }

  const { error } = await supabase
    .from('terms')
    .update({
      name,
      starts_on: optStr(form, 'starts_on'),
      ends_on: optStr(form, 'ends_on'),
    })
    .eq('id', str(form, 'term_id'))

  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/periodos')
  return { ok: true }
}
