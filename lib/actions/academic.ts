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
