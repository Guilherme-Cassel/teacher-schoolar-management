'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getCurrentYear } from '@/lib/data/context'
import {
  type ImportContext,
  type ImportPreview,
  normalize,
  parseImportWorkbook,
} from '@/lib/import/parse'
import { friendlyError, requireContext } from './_helpers'

const MAX_BYTES = 5 * 1024 * 1024

export type ImportResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string }

export type CommitResult =
  | { ok: true; written: { students: number; assessments: number; grades: number; attendance: number } }
  | { ok: false; error: string }

/** Turmas, ofertas, períodos e alunos do ambiente/ano atual. */
async function loadContext(): Promise<{ ctx: ImportContext; schoolId: string; yearId: string } | null> {
  const app = await requireContext()
  const { year, terms } = await getCurrentYear(app.schoolId)
  if (!year) return null

  const supabase = await createClient()

  const [classesRes, offersRes, studentsRes] = await Promise.all([
    supabase.from('classes').select('id, name').eq('school_year_id', year.id).order('name'),
    supabase
      .from('class_subjects')
      .select('id, class_id, classes(name), subjects(name)')
      .eq('school_id', app.schoolId),
    supabase
      .from('students')
      .select('id, full_name, registration_code')
      .eq('school_id', app.schoolId),
  ])

  const classIds = new Set((classesRes.data ?? []).map((c) => c.id))

  const offers = ((offersRes.data ?? []) as unknown as {
    id: string
    class_id: string
    classes: { name: string } | null
    subjects: { name: string } | null
  }[])
    // Ofertas de anos anteriores não podem receber importação do ano atual.
    .filter((o) => classIds.has(o.class_id))
    .map((o) => ({
      id: o.id,
      classId: o.class_id,
      className: o.classes?.name ?? '',
      subjectName: o.subjects?.name ?? '',
    }))

  return {
    schoolId: app.schoolId,
    yearId: year.id,
    ctx: {
      classes: classesRes.data ?? [],
      offers,
      terms: terms.map((t) => ({ id: t.id, name: t.name })),
      students: (studentsRes.data ?? []).map((s) => ({
        id: s.id,
        fullName: s.full_name,
        registrationCode: s.registration_code,
      })),
    },
  }
}

async function readUpload(form: FormData): Promise<ArrayBuffer | string> {
  const file = form.get('arquivo')
  if (!(file instanceof File) || file.size === 0) return 'Escolha um arquivo .xlsx para enviar.'
  if (file.size > MAX_BYTES) return 'O arquivo passa de 5 MB. Divida a importação em partes.'
  if (!/\.xlsx$/i.test(file.name)) {
    return 'Envie o arquivo no formato .xlsx. Se estiver no Google Sheets, use Arquivo → Fazer download → Microsoft Excel.'
  }
  return file.arrayBuffer()
}

/**
 * Lê a planilha e devolve a prévia. Não grava nada — é a etapa em que a
 * professora confere o que vai entrar antes de confirmar.
 */
export async function analyzeImport(_prev: unknown, form: FormData): Promise<ImportResult> {
  const loaded = await loadContext()
  if (!loaded) {
    return { ok: false, error: 'Crie um ano letivo com períodos antes de importar.' }
  }

  const data = await readUpload(form)
  if (typeof data === 'string') return { ok: false, error: data }

  try {
    return { ok: true, preview: await parseImportWorkbook(data, loaded.ctx) }
  } catch {
    return {
      ok: false,
      error: 'Não foi possível ler a planilha. Confirme que é o modelo baixado e que está em .xlsx.',
    }
  }
}

/**
 * Grava a importação.
 *
 * A planilha é enviada e lida de novo em vez de confiar no que o navegador
 * devolveria da prévia: o que vai para o banco precisa ser exatamente o que
 * foi validado no servidor, não uma estrutura que o cliente pode ter mexido.
 */
export async function commitImport(_prev: unknown, form: FormData): Promise<CommitResult> {
  const loaded = await loadContext()
  if (!loaded) {
    return { ok: false, error: 'Crie um ano letivo com períodos antes de importar.' }
  }

  const data = await readUpload(form)
  if (typeof data === 'string') return { ok: false, error: data }

  const { schoolId, ctx } = loaded
  const supabase = await createClient()

  let preview: ImportPreview
  try {
    preview = await parseImportWorkbook(data, ctx)
  } catch {
    return { ok: false, error: 'Não foi possível ler a planilha.' }
  }

  if (preview.issues.length > 0) {
    return {
      ok: false,
      error: `A planilha ainda tem ${preview.issues.length} problema(s). Corrija e envie de novo.`,
    }
  }

  // ------------------------------------------------------- 1. alunos novos --
  const toCreate = preview.students.filter((s) => !s.existingId)
  const createdIds = new Map<string, string>() // chave normalizada -> id

  if (toCreate.length > 0) {
    const { data: created, error } = await supabase
      .from('students')
      .insert(
        toCreate.map((s) => ({
          school_id: schoolId,
          full_name: s.fullName,
          registration_code: s.registrationCode,
          birth_date: s.birthDate,
          guardian_name: s.guardianName,
          guardian_contact: s.guardianContact,
        })),
      )
      .select('id, full_name, registration_code')

    if (error) return { ok: false, error: friendlyError(error) }

    for (const row of created ?? []) {
      if (row.registration_code) createdIds.set(normalize(row.registration_code), row.id)
      createdIds.set(normalize(row.full_name), row.id)
    }

    // Matrícula na turma indicada — sem ela o aluno não aparece em nenhuma tela.
    const enrollments = toCreate
      .map((s) => {
        const id =
          (s.registrationCode && createdIds.get(normalize(s.registrationCode))) ??
          createdIds.get(normalize(s.fullName))
        return id && s.classId ? { school_id: schoolId, student_id: id, class_id: s.classId } : null
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)

    if (enrollments.length > 0) {
      const { error: enrollError } = await supabase
        .from('enrollments')
        .upsert(enrollments, { onConflict: 'student_id,class_id', ignoreDuplicates: true })
      if (enrollError) return { ok: false, error: friendlyError(enrollError) }
    }
  }

  // Índice completo de resolução: já existentes + recém-criados.
  const studentIdByRef = new Map<string, string>()
  for (const s of ctx.students) {
    if (s.registrationCode) studentIdByRef.set(normalize(s.registrationCode), s.id)
    studentIdByRef.set(normalize(s.fullName), s.id)
  }
  for (const [key, id] of createdIds) studentIdByRef.set(key, id)

  const resolve = (ref: string, known: string | null) => known ?? studentIdByRef.get(normalize(ref))

  // -------------------------------------------------------- 2. avaliações --
  const needed = new Map<string, { classSubjectId: string; termId: string; name: string; weight: number; maxScore: number }>()
  for (const g of preview.grades) {
    const key = `${g.classSubjectId}|${g.termId}|${normalize(g.assessmentName)}`
    if (!needed.has(key)) {
      needed.set(key, {
        classSubjectId: g.classSubjectId,
        termId: g.termId,
        name: g.assessmentName,
        weight: g.weight,
        maxScore: g.maxScore,
      })
    }
  }

  const assessmentIdByKey = new Map<string, string>()

  if (needed.size > 0) {
    const offerIds = [...new Set([...needed.values()].map((a) => a.classSubjectId))]
    const { data: existing, error } = await supabase
      .from('assessments')
      .select('id, class_subject_id, term_id, name')
      .in('class_subject_id', offerIds)

    if (error) return { ok: false, error: friendlyError(error) }

    for (const a of existing ?? []) {
      assessmentIdByKey.set(
        `${a.class_subject_id}|${a.term_id}|${normalize(a.name)}`,
        a.id,
      )
    }

    const missing = [...needed.entries()].filter(([key]) => !assessmentIdByKey.has(key))

    if (missing.length > 0) {
      const { data: created, error: createError } = await supabase
        .from('assessments')
        .insert(
          missing.map(([, a]) => ({
            school_id: schoolId,
            class_subject_id: a.classSubjectId,
            term_id: a.termId,
            name: a.name,
            weight: a.weight,
            max_score: a.maxScore,
          })),
        )
        .select('id, class_subject_id, term_id, name')

      if (createError) return { ok: false, error: friendlyError(createError) }

      for (const a of created ?? []) {
        assessmentIdByKey.set(`${a.class_subject_id}|${a.term_id}|${normalize(a.name)}`, a.id)
      }
    }
  }

  // ------------------------------------------------------------- 3. notas --
  const gradeRows = preview.grades
    .map((g) => {
      const studentId = resolve(g.studentRef, g.studentId)
      const assessmentId = assessmentIdByKey.get(
        `${g.classSubjectId}|${g.termId}|${normalize(g.assessmentName)}`,
      )
      if (!studentId || !assessmentId) return null
      return {
        assessment_id: assessmentId,
        student_id: studentId,
        score: g.isAbsent ? null : g.score,
        is_absent: g.isAbsent,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (gradeRows.length > 0) {
    // Via RPC porque o período do dado histórico quase sempre está fechado, e
    // o trigger assert_term_open recusaria a escrita direta. Ver migration
    // 0005: a exceção vive dentro daquela função e só dura a transação dela.
    const { error } = await supabase.rpc('import_historical_grades', { p_rows: gradeRows })
    if (error) return { ok: false, error: friendlyError(error) }
  }

  // -------------------------------------------------------- 4. frequência --
  const attendanceRows = preview.attendance
    .map((a) => {
      const studentId = resolve(a.studentRef, a.studentId)
      if (!studentId) return null
      return {
        school_id: schoolId,
        student_id: studentId,
        class_subject_id: a.classSubjectId,
        term_id: a.termId,
        classes_held: a.classesHeld,
        absences: a.absences,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (attendanceRows.length > 0) {
    // term_attendance não tem o trigger de período fechado, então a escrita
    // normal (sob RLS) resolve.
    const { error } = await supabase
      .from('term_attendance')
      .upsert(attendanceRows, { onConflict: 'student_id,class_subject_id,term_id' })
    if (error) return { ok: false, error: friendlyError(error) }
  }

  for (const path of ['/painel', '/alunos', '/notas', '/frequencia', '/fechamento', '/relatorios']) {
    revalidatePath(path)
  }

  return {
    ok: true,
    written: {
      students: toCreate.length,
      assessments: assessmentIdByKey.size,
      grades: gradeRows.length,
      attendance: attendanceRows.length,
    },
  }
}

/** Dados do ambiente para gerar o modelo de planilha. */
export async function getTemplateContext() {
  const app = await getAppContext()
  if (!app) return null
  const loaded = await loadContext()
  if (!loaded) return null

  return {
    schoolName: app.schoolName,
    classes: loaded.ctx.classes.map((c) => c.name),
    subjects: [...new Set(loaded.ctx.offers.map((o) => o.subjectName))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    ),
    terms: loaded.ctx.terms.map((t) => t.name),
    students: loaded.ctx.students.map((s) => ({
      fullName: s.fullName,
      registrationCode: s.registrationCode,
    })),
  }
}
