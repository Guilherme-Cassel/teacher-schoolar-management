'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  type ActionResult,
  friendlyError,
  optStr,
  requireContext,
  str,
} from './_helpers'

/** Junta os impedimentos numa frase só, em português. */
function blockedMessage(what: string, reasons: string[]): string {
  const list =
    reasons.length === 1
      ? reasons[0]
      : `${reasons.slice(0, -1).join(', ')} e ${reasons[reasons.length - 1]}`
  return `Não é possível excluir ${what}: há ${list}. Remova esses registros antes.`
}

// ------------------------------------------------------------- disciplinas --

export async function createSubject(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const name = str(form, 'name')
  if (!name) return { ok: false, error: 'Informe o nome da disciplina.' }

  const { error } = await supabase
    .from('subjects')
    .insert({ school_id: ctx.schoolId, name, code: optStr(form, 'code') })

  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/turmas')
  return { ok: true }
}

/**
 * Excluir disciplina cascateia para class_subjects e, dali, para assessments,
 * grades, term_closures, term_attendance e final_results. Sem esta checagem o
 * único aviso é um confirm() no navegador, e um clique errado apaga em
 * silêncio o ano inteiro de lançamentos daquela disciplina.
 */
export async function deleteSubject(id: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const { data: offers } = await supabase
    .from('class_subjects')
    .select('id, classes(name)')
    .eq('subject_id', id)

  const offerIds = (offers ?? []).map((o) => o.id)

  if (offerIds.length > 0) {
    const [assessments, closures] = await Promise.all([
      supabase
        .from('assessments')
        .select('*', { count: 'exact', head: true })
        .in('class_subject_id', offerIds),
      supabase
        .from('term_closures')
        .select('*', { count: 'exact', head: true })
        .in('class_subject_id', offerIds),
    ])

    const reasons: string[] = []
    const classNames = (offers ?? [])
      .map((o) => (o as unknown as { classes: { name: string } | null }).classes?.name)
      .filter(Boolean)

    reasons.push(
      `${offerIds.length} turma(s) usando esta disciplina${
        classNames.length ? ` (${classNames.join(', ')})` : ''
      }`,
    )
    if (assessments.count) reasons.push(`${assessments.count} avaliação(ões) lançada(s)`)
    if (closures.count) reasons.push(`${closures.count} fechamento(s) registrado(s)`)

    return { ok: false, error: blockedMessage('esta disciplina', reasons) }
  }

  const { error } = await supabase.from('subjects').delete().eq('id', id)
  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/turmas')
  return { ok: true }
}

// ------------------------------------------------------------------ turmas --

export async function createClass(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const name = str(form, 'name')
  const schoolYearId = str(form, 'school_year_id')
  if (!name) return { ok: false, error: 'Informe o nome da turma.' }
  if (!schoolYearId) return { ok: false, error: 'Crie um ano letivo antes de cadastrar turmas.' }

  const { error } = await supabase.from('classes').insert({
    school_id: ctx.schoolId,
    school_year_id: schoolYearId,
    name,
    shift: optStr(form, 'shift'),
  })

  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/turmas')
  return { ok: true }
}

/**
 * Mesma armadilha da disciplina, em escala maior: a turma cascateia para
 * matrículas e ofertas, e dali para todas as notas, frequências e
 * fechamentos do ano. É a exclusão mais destrutiva do sistema.
 */
export async function deleteClass(id: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()

  const [enrollments, offersRes] = await Promise.all([
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('class_id', id),
    supabase.from('class_subjects').select('id').eq('class_id', id),
  ])

  const offerIds = (offersRes.data ?? []).map((o) => o.id)

  const [assessments, closures] = offerIds.length
    ? await Promise.all([
        supabase
          .from('assessments')
          .select('*', { count: 'exact', head: true })
          .in('class_subject_id', offerIds),
        supabase
          .from('term_closures')
          .select('*', { count: 'exact', head: true })
          .in('class_subject_id', offerIds),
      ])
    : [{ count: 0 }, { count: 0 }]

  const reasons: string[] = []
  if (enrollments.count) reasons.push(`${enrollments.count} aluno(s) matriculado(s)`)
  if (offerIds.length) reasons.push(`${offerIds.length} disciplina(s) vinculada(s)`)
  if (assessments.count) reasons.push(`${assessments.count} avaliação(ões) lançada(s)`)
  if (closures.count) reasons.push(`${closures.count} fechamento(s) registrado(s)`)

  if (reasons.length > 0) {
    return { ok: false, error: blockedMessage('esta turma', reasons) }
  }

  const { error } = await supabase.from('classes').delete().eq('id', id)
  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/turmas')
  return { ok: true }
}

/** Vincula uma disciplina a uma turma — cria a "oferta" que recebe notas. */
export async function addClassSubject(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { error } = await supabase.from('class_subjects').insert({
    school_id: ctx.schoolId,
    class_id: str(form, 'class_id'),
    subject_id: str(form, 'subject_id'),
    teacher_id: ctx.userId,
  })

  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/turmas')
  return { ok: true }
}

export async function removeClassSubject(id: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()
  const { error } = await supabase.from('class_subjects').delete().eq('id', id)
  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/turmas')
  return { ok: true }
}

// ------------------------------------------------------------------ alunos --

export async function saveStudent(_prev: unknown, form: FormData): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const id = optStr(form, 'id')
  const fullName = str(form, 'full_name')
  if (!fullName) return { ok: false, error: 'Informe o nome do aluno.' }

  const payload = {
    school_id: ctx.schoolId,
    full_name: fullName,
    registration_code: optStr(form, 'registration_code'),
    birth_date: optStr(form, 'birth_date'),
    guardian_name: optStr(form, 'guardian_name'),
    guardian_contact: optStr(form, 'guardian_contact'),
    notes: optStr(form, 'notes'),
  }

  const { data, error } = id
    ? await supabase.from('students').update(payload).eq('id', id).select('id').single()
    : await supabase.from('students').insert(payload).select('id').single()

  if (error) return { ok: false, error: friendlyError(error) }

  // Matrícula na turma escolhida (se houver e ainda não existir).
  const classId = optStr(form, 'class_id')
  if (classId && data) {
    const { error: enrollError } = await supabase
      .from('enrollments')
      .upsert(
        { school_id: ctx.schoolId, student_id: data.id, class_id: classId },
        { onConflict: 'student_id,class_id', ignoreDuplicates: true },
      )
    if (enrollError) return { ok: false, error: friendlyError(enrollError) }
  }

  revalidatePath('/alunos')
  return { ok: true }
}

export async function setStudentActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()
  const { error } = await supabase.from('students').update({ is_active: isActive }).eq('id', id)
  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/alunos')
  return { ok: true }
}

export async function enrollStudent(studentId: string, classId: string): Promise<ActionResult> {
  const ctx = await requireContext()
  const supabase = await createClient()
  const { error } = await supabase
    .from('enrollments')
    .upsert(
      { school_id: ctx.schoolId, student_id: studentId, class_id: classId },
      { onConflict: 'student_id,class_id', ignoreDuplicates: true },
    )
  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/alunos')
  return { ok: true }
}

export async function unenrollStudent(enrollmentId: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()
  const { error } = await supabase.from('enrollments').delete().eq('id', enrollmentId)
  if (error) return { ok: false, error: friendlyError(error) }
  revalidatePath('/alunos')
  return { ok: true }
}

// ------------------------------------------------------- importação de CSV --

export interface ImportResult {
  ok: boolean
  created: number
  skipped: number
  errors: string[]
}

/**
 * Importa alunos de um CSV colado pela professora.
 * Aceita "nome", ou "nome;matrícula", ou "nome;matrícula;responsável;contato".
 * Separador vírgula, ponto e vírgula ou tabulação.
 */
export async function importStudents(
  classId: string | null,
  raw: string,
): Promise<ImportResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { ok: false, created: 0, skipped: 0, errors: ['Nada para importar.'] }
  }

  // Descarta um possível cabeçalho.
  const first = lines[0].toLowerCase()
  const body = /nome|aluno|student/.test(first) && !/\d{3}/.test(first) ? lines.slice(1) : lines

  const errors: string[] = []
  let created = 0
  let skipped = 0

  for (const [i, line] of body.entries()) {
    const cols = line.split(/[;\t,]/).map((c) => c.trim())
    const fullName = cols[0]

    if (!fullName || fullName.length < 2) {
      errors.push(`Linha ${i + 1}: nome vazio ou muito curto.`)
      continue
    }

    const { data, error } = await supabase
      .from('students')
      .insert({
        school_id: ctx.schoolId,
        full_name: fullName,
        registration_code: cols[1] || null,
        guardian_name: cols[2] || null,
        guardian_contact: cols[3] || null,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        skipped++
      } else {
        errors.push(`Linha ${i + 1} (${fullName}): ${friendlyError(error)}`)
      }
      continue
    }

    created++

    if (classId) {
      await supabase.from('enrollments').upsert(
        { school_id: ctx.schoolId, student_id: data.id, class_id: classId },
        { onConflict: 'student_id,class_id', ignoreDuplicates: true },
      )
    }
  }

  revalidatePath('/alunos')
  return { ok: errors.length === 0, created, skipped, errors }
}
