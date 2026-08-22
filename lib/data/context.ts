import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_GRADING_CONFIG, type GradingConfig } from '@/lib/domain/grading'

/** Ambiente ativo. Cookie, e não querystring: precisa sobreviver à navegação. */
export const SCHOOL_COOKIE = 'current_school_id'

export type MemberRole = 'teacher' | 'coordinator' | 'admin'

export interface SchoolOption {
  id: string
  name: string
  role: MemberRole
}

export interface AppContext {
  userId: string
  email: string
  schoolId: string
  schoolName: string
  role: MemberRole
  displayName: string | null
  /** Todos os ambientes do usuário, para alimentar o seletor. */
  schools: SchoolOption[]
}

/** Sessão autenticada, independente de ter vínculo com escola. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub as string, email: (claims.email as string) ?? '' }
})

/**
 * Contexto da sessão. `cache` garante uma única consulta por request,
 * mesmo sendo chamado por vários Server Components da mesma página.
 *
 * Devolve null em dois casos distintos: sem sessão, ou autenticado sem
 * nenhum ambiente. Quem precisa separar os dois usa getAuthUser() —
 * é o que o layout faz para mandar a professora ao primeiro acesso.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const user = await getAuthUser()
  if (!user) return null

  const supabase = await createClient()

  const { data } = await supabase
    .from('school_members')
    .select('school_id, role, display_name, schools(name, created_at)')
    .eq('user_id', user.id)

  if (!data?.length) return null

  type Row = {
    school_id: string
    role: MemberRole
    display_name: string | null
    schools: { name: string; created_at: string } | null
  }

  // Ordem estável por data de criação: o seletor não pode dançar entre
  // requisições, e o fallback precisa cair sempre no mesmo ambiente.
  const rows = ([...data] as unknown as Row[]).sort((a, b) => {
    const at = a.schools?.created_at ?? ''
    const bt = b.schools?.created_at ?? ''
    return at === bt ? a.school_id.localeCompare(b.school_id) : at.localeCompare(bt)
  })

  const schools: SchoolOption[] = rows.map((r) => ({
    id: r.school_id,
    name: r.schools?.name ?? 'Minha escola',
    role: r.role,
  }))

  // Um cookie apontando para escola que saiu do ar (vínculo removido, escola
  // apagada) não pode derrubar o app: cai no primeiro ambiente em silêncio.
  const cookieStore = await cookies()
  const wanted = cookieStore.get(SCHOOL_COOKIE)?.value
  const current = rows.find((r) => r.school_id === wanted) ?? rows[0]

  return {
    userId: user.id,
    email: user.email,
    schoolId: current.school_id,
    schoolName: current.schools?.name ?? 'Minha escola',
    role: current.role,
    displayName: current.display_name,
    schools,
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

/** Linha de grading_configs como vem do banco. */
export interface GradingConfigRow {
  class_subject_id: string | null
  passing_grade: number
  max_grade: number
  method: GradingConfig['method']
  decimal_places: number
  has_recovery: boolean
  recovery_passing_grade: number | null
  min_attendance_pct: number
  adjust_tolerance: number
  conduct_threshold: number
}

/**
 * Converte a linha do banco na configuração usada pelo domínio.
 *
 * Exportada porque quem monta o boletim precisa resolver a configuração de
 * várias ofertas de uma vez — chamar getGradingConfig por oferta seria uma
 * consulta por disciplina.
 */
export function toGradingConfig(row: GradingConfigRow): GradingConfig {
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
}

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

  return toGradingConfig(row as GradingConfigRow)
})
