'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, friendlyError, optStr, requireContext, str } from './_helpers'

export async function createOccurrence(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const type = str(form, 'type')
  const category = str(form, 'category')
  const severity = Number(str(form, 'severity') || '1')

  if (type !== 'praise' && type !== 'criticism') {
    return { ok: false, error: 'Escolha se é um elogio ou uma crítica.' }
  }
  if (!category) return { ok: false, error: 'Escolha uma categoria.' }
  if (![1, 2, 3].includes(severity)) return { ok: false, error: 'Severidade inválida.' }

  const { error } = await supabase.from('occurrences').insert({
    school_id: ctx.schoolId,
    student_id: str(form, 'student_id'),
    term_id: str(form, 'term_id'),
    class_subject_id: optStr(form, 'class_subject_id'),
    type,
    category,
    severity,
    description: optStr(form, 'description'),
    occurred_on: optStr(form, 'occurred_on') ?? new Date().toISOString().slice(0, 10),
    created_by: ctx.userId,
  })

  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/ocorrencias')
  revalidatePath('/fechamento')
  revalidatePath('/painel')
  return { ok: true }
}

export async function deleteOccurrence(id: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const { error } = await supabase.from('occurrences').delete().eq('id', id)
  if (error) return { ok: false, error: friendlyError(error) }

  revalidatePath('/ocorrencias')
  revalidatePath('/fechamento')
  return { ok: true }
}
