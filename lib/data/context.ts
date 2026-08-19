import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_GRADING_CONFIG, type GradingConfig } from '@/lib/domain/grading'

export interface AppContext {
  userId: string
  email: string
  schoolId: string
  schoolName: string
  role: 'teacher' | 'coordinator' | 'admin'
  displayName: string | null
}

/**
 * Contexto da sessão. `cache` garante uma única consulta por request,
 * mesmo sendo chamado por vários Server Components da mesma página.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient()

  // Verificação local da assinatura do JWT — sem ida à rede. Ver middleware.ts.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  if (!claims?.sub) return null

  const { data } = await supabase
    .from('school_members')
    .select('school_id, role, display_name, schools(name)')
    .eq('user_id', claims.sub)
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const school = data.schools as unknown as { name: string } | null

  return {
    userId: claims.sub,
    email: claims.email ?? '',
    schoolId: data.school_id,
    schoolName: school?.name ?? 'Minha escola',
    role: data.role,
    displayName: data.display_name,
  }
})

export interface TermRow {
  id: string
  name: string
  position: number
  status: 'planned' | 'open' | 'closed'
  starts_on: string | null
  ends_on: string | null
  school_year_id: string
}

export interface SchoolYearRow {
  id: string
  year: number
  is_current: boolean
}

/** Ano letivo corrente (ou o mais recente) com seus períodos. */
export const getCurrentYear = cache(async (schoolId: string) => {
  const supabase = await createClient()

  // Ano e períodos numa única ida ao banco: cada round-trip ao Supabase
  // custa ~350ms, então encadear consultas é o que trava a navegação.
  const { data } = await supabase
    .from('school_years')
    .select('id, year, is_current, terms(id, name, position, status, starts_on, ends_on, school_year_id)')
    .eq('school_id', schoolId)
    .order('is_current', { ascending: false })
    .order('year', { ascending: false })
    .limit(1)

  const row = data?.[0] as (SchoolYearRow & { terms: TermRow[] }) | undefined
  if (!row) return { year: null, terms: [] as TermRow[], openTerm: null as TermRow | null }

  const { terms, ...year } = row
  const list = [...(terms ?? [])].sort((a, b) => a.position - b.position)

  return {
    year: year as SchoolYearRow,
    terms: list,
    openTerm: list.find((t) => t.status === 'open') ?? null,
  }
})

/**
 * Configuração de avaliação: a da oferta, se existir; senão a padrão da escola;
 * senão os valores de fábrica.
 */
export const getGradingConfig = cache(async (
  schoolId: string,
  classSubjectId?: string,
): Promise<GradingConfig> => {
  const supabase = await createClient()

  const { data } = await supabase
    .from('grading_configs')
    .select('*')
    .eq('school_id', schoolId)
    .or(classSubjectId ? `class_subject_id.eq.${classSubjectId},class_subject_id.is.null` : 'class_subject_id.is.null')

  if (!data?.length) return DEFAULT_GRADING_CONFIG

  // Específica da oferta tem prioridade sobre a padrão da escola.
  const row = data.find((r) => r.class_subject_id === classSubjectId) ?? data[0]

  return {
    passingGrade: Number(row.passing_grade),
    maxGrade: Number(row.max_grade),
    method: row.method,
    decimalPlaces: row.decimal_places,
    hasRecovery: row.has_recovery,
    recoveryPassingGrade: Number(row.recovery_passing_grade ?? 6),
    minAttendancePct: Number(row.min_attendance_pct),
    adjustTolerance: Number(row.adjust_tolerance),
    conductThreshold: row.conduct_threshold,
  }
})
