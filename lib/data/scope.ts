import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentYear, type TermRow } from './context'

export interface OfferOption {
  id: string
  className: string
  subjectName: string
  classId: string
}

/** Todas as ofertas (turma + disciplina) do ano letivo corrente. */
export const getOffers = cache(async (schoolId: string): Promise<OfferOption[]> => {
  const { year } = await getCurrentYear(schoolId)
  if (!year) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('class_subjects')
    .select('id, class_id, classes!inner(id, name, school_year_id), subjects(name)')
    .eq('school_id', schoolId)
    .eq('classes.school_year_id', year.id)

  const rows = (data ?? []) as unknown as {
    id: string
    class_id: string
    classes: { name: string } | null
    subjects: { name: string } | null
  }[]

  return rows
    .map((r) => ({
      id: r.id,
      classId: r.class_id,
      className: r.classes?.name ?? '—',
      subjectName: r.subjects?.name ?? '—',
    }))
    .sort((a, b) =>
      a.className.localeCompare(b.className, 'pt-BR') ||
      a.subjectName.localeCompare(b.subjectName, 'pt-BR'),
    )
})

export interface Scope {
  offers: OfferOption[]
  terms: TermRow[]
  offer: OfferOption | null
  term: TermRow | null
  /** true quando o período selecionado não aceita mais lançamentos. */
  locked: boolean
}

/**
 * Resolve a oferta e o período selecionados a partir da query string,
 * caindo em padrões sensatos: a primeira oferta e o período aberto.
 */
export async function resolveScope(
  schoolId: string,
  params: { oferta?: string; periodo?: string },
): Promise<Scope> {
  const [offers, { terms, openTerm }] = await Promise.all([
    getOffers(schoolId),
    getCurrentYear(schoolId),
  ])

  const offer = offers.find((o) => o.id === params.oferta) ?? offers[0] ?? null
  const term =
    terms.find((t) => t.id === params.periodo) ?? openTerm ?? terms[0] ?? null

  return {
    offers,
    terms,
    offer,
    term,
    locked: term?.status === 'closed',
  }
}

export interface StudentBrief {
  id: string
  full_name: string
  registration_code: string | null
}

/** Alunos matriculados e ativos numa turma, em ordem alfabética. */
export const getClassStudents = cache(async (classId: string): Promise<StudentBrief[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('enrollments')
    .select('students!inner(id, full_name, registration_code, is_active)')
    .eq('class_id', classId)
    .eq('status', 'active')

  const rows = (data ?? []) as unknown as {
    students: { id: string; full_name: string; registration_code: string | null; is_active: boolean }
  }[]

  return rows
    .map((r) => r.students)
    .filter((s) => s.is_active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
    .map(({ id, full_name, registration_code }) => ({ id, full_name, registration_code }))
})
