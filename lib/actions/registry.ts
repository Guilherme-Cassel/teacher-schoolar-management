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

export async function deleteSubject(id: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()
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

export async function deleteClass(id: string): Promise<ActionResult> {
  await requireContext()
  const supabase = await createClient()
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
