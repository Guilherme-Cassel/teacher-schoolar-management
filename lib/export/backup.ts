import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { SHEET } from '@/lib/import/template'
import { severityLabel, type OccurrenceType, type Severity } from '@/lib/domain/conduct'

/**
 * Backup completo de um ambiente, em .xlsx.
 *
 * As três primeiras abas repetem, na mesma ordem de colunas, o modelo de
 * importação — de propósito. Assim o backup não é só um arquivo morto: ele
 * volta pelo Importar dados, seja para restaurar depois de um engano, seja
 * para levar a turma inteira para outro ambiente. A coluna "Ano letivo" entra
 * no fim porque o parser lê as colunas por posição e ignora o que vem depois
 * da última que ele conhece.
 *
 * As demais abas guardam o que a importação não traz de volta (ocorrências,
 * fechamentos, resultados finais). Elas existem porque este arquivo é a
 * última chance antes de uma exclusão irreversível: perder o histórico de
 * conduta seria perder justamente a parte que não se reconstrói.
 */

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
}

function sheetWith(wb: ExcelJS.Workbook, name: string, columns: Partial<ExcelJS.Column>[]) {
  const sheet = wb.addWorksheet(name)
  sheet.columns = columns
  const row = sheet.getRow(1)
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = HEADER_FILL
  row.height = 20
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  return sheet
}

function isoToBr(value: string | null): string {
  if (!value) return ''
  const m = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}

export interface BackupStats {
  students: number
  grades: number
  occurrences: number
  closures: number
  attendance: number
}

export async function buildSchoolBackup(schoolId: string): Promise<{
  buffer: ArrayBuffer
  schoolName: string
  stats: BackupStats
}> {
  const supabase = await createClient()

  const [schoolRes, yearsRes, classesRes, offersRes, studentsRes, enrollmentsRes] =
    await Promise.all([
      supabase.from('schools').select('name').eq('id', schoolId).maybeSingle(),
      supabase.from('school_years').select('id, year').eq('school_id', schoolId),
      supabase.from('classes').select('id, name, school_year_id').eq('school_id', schoolId),
      supabase
        .from('class_subjects')
        .select('id, class_id, subjects(name)')
        .eq('school_id', schoolId),
      supabase
        .from('students')
        .select('id, full_name, registration_code, birth_date, guardian_name, guardian_contact, notes, is_active')
        .eq('school_id', schoolId),
      supabase.from('enrollments').select('student_id, class_id, status').eq('school_id', schoolId),
    ])

  const [termsRes, assessmentsRes, gradesRes, attendanceRes, occurrencesRes, closuresRes, finalsRes] =
    await Promise.all([
      supabase.from('terms').select('id, name, school_year_id').eq('school_id', schoolId),
      supabase
        .from('assessments')
        .select('id, class_subject_id, term_id, name, weight, max_score')
        .eq('school_id', schoolId),
      supabase
        .from('grades')
        .select('assessment_id, student_id, score, is_absent')
        .eq('school_id', schoolId),
      supabase
        .from('term_attendance')
        .select('student_id, class_subject_id, term_id, classes_held, absences')
        .eq('school_id', schoolId),
      supabase
        .from('occurrences')
        .select('student_id, term_id, class_subject_id, type, category, severity, description, occurred_on')
        .eq('school_id', schoolId)
        .order('occurred_on'),
      supabase
        .from('term_closures')
        .select('student_id, class_subject_id, term_id, calculated_average, final_grade, was_adjusted, justification, conduct_score, attendance_pct, decided_at')
        .eq('school_id', schoolId),
      supabase
        .from('final_results')
        .select('student_id, class_subject_id, school_year_id, annual_average, attendance_pct, status, notes, closed_at')
        .eq('school_id', schoolId),
    ])

  // ------------------------------------------------------------- índices --
  const yearById = new Map((yearsRes.data ?? []).map((y) => [y.id, y.year]))
  const classById = new Map((classesRes.data ?? []).map((c) => [c.id, c]))
  const termById = new Map((termsRes.data ?? []).map((t) => [t.id, t]))
  const studentById = new Map((studentsRes.data ?? []).map((s) => [s.id, s]))

  type OfferRow = { id: string; class_id: string; subjects: { name: string } | null }
  const offerById = new Map(
    ((offersRes.data ?? []) as unknown as OfferRow[]).map((o) => [o.id, o]),
  )

  const classOfStudent = new Map<string, string>()
  for (const e of enrollmentsRes.data ?? []) {
    if (e.status === 'active' || !classOfStudent.has(e.student_id)) {
      classOfStudent.set(e.student_id, e.class_id)
    }
  }

  const assessmentById = new Map((assessmentsRes.data ?? []).map((a) => [a.id, a]))

  /** Turma, disciplina, período e ano de uma oferta — usados em várias abas. */
  const where = (classSubjectId: string | null, termId: string | null) => {
    const offer = classSubjectId ? offerById.get(classSubjectId) : undefined
    const cls = offer ? classById.get(offer.class_id) : undefined
    const term = termId ? termById.get(termId) : undefined
    return {
      className: cls?.name ?? '',
      subjectName: offer?.subjects?.name ?? '',
      termName: term?.name ?? '',
      year: term ? (yearById.get(term.school_year_id) ?? '') : (cls ? yearById.get(cls.school_year_id) ?? '' : ''),
    }
  }

  const who = (studentId: string) => {
    const s = studentById.get(studentId)
    return { code: s?.registration_code ?? '', name: s?.full_name ?? '' }
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Gestão Escolar'

  // ---------------------------------------------------------- 1. alunos --
  const students = sheetWith(wb, SHEET.students, [
    { header: 'Nome completo', width: 34 },
    { header: 'Matrícula', width: 14 },
    { header: 'Nascimento (DD/MM/AAAA)', width: 24 },
    { header: 'Responsável', width: 28 },
    { header: 'Contato do responsável', width: 24 },
    { header: 'Turma', width: 16 },
    { header: 'Observações', width: 30 },
    { header: 'Ativo', width: 10 },
  ])
  for (const s of studentsRes.data ?? []) {
    const cls = classOfStudent.get(s.id)
    students.addRow([
      s.full_name,
      s.registration_code ?? '',
      isoToBr(s.birth_date),
      s.guardian_name ?? '',
      s.guardian_contact ?? '',
      cls ? (classById.get(cls)?.name ?? '') : '',
      s.notes ?? '',
      s.is_active ? 'Sim' : 'Não',
    ])
  }

  // ----------------------------------------------------------- 2. notas --
  const grades = sheetWith(wb, SHEET.grades, [
    { header: 'Matrícula', width: 14 },
    { header: 'Nome completo', width: 34 },
    { header: 'Turma', width: 16 },
    { header: 'Disciplina', width: 20 },
    { header: 'Período', width: 18 },
    { header: 'Avaliação', width: 24 },
    { header: 'Peso', width: 8 },
    { header: 'Nota máxima', width: 14 },
    { header: 'Nota', width: 10 },
    { header: 'Ano letivo', width: 12 },
  ])
  for (const g of gradesRes.data ?? []) {
    const a = assessmentById.get(g.assessment_id)
    if (!a) continue
    const w = where(a.class_subject_id, a.term_id)
    const p = who(g.student_id)
    grades.addRow([
      p.code,
      p.name,
      w.className,
      w.subjectName,
      w.termName,
      a.name,
      Number(a.weight),
      Number(a.max_score),
      g.is_absent ? 'FALTA' : g.score === null ? '' : Number(g.score),
      w.year,
    ])
  }

  // ------------------------------------------------------ 3. frequência --
  const attendance = sheetWith(wb, SHEET.attendance, [
    { header: 'Matrícula', width: 14 },
    { header: 'Nome completo', width: 34 },
    { header: 'Turma', width: 16 },
    { header: 'Disciplina', width: 20 },
    { header: 'Período', width: 18 },
    { header: 'Aulas dadas', width: 14 },
    { header: 'Faltas', width: 10 },
    { header: 'Ano letivo', width: 12 },
  ])
  for (const t of attendanceRes.data ?? []) {
    const w = where(t.class_subject_id, t.term_id)
    const p = who(t.student_id)
    attendance.addRow([p.code, p.name, w.className, w.subjectName, w.termName, t.classes_held, t.absences, w.year])
  }

  // ----------------------------------------------------- 4. ocorrências --
  const occurrences = sheetWith(wb, 'Ocorrências', [
    { header: 'Data', width: 12 },
    { header: 'Matrícula', width: 14 },
    { header: 'Nome completo', width: 34 },
    { header: 'Tipo', width: 12 },
    { header: 'Categoria', width: 24 },
    { header: 'Peso', width: 14 },
    { header: 'Descrição', width: 60 },
    { header: 'Disciplina', width: 20 },
    { header: 'Período', width: 18 },
    { header: 'Ano letivo', width: 12 },
  ])
  for (const o of occurrencesRes.data ?? []) {
    const w = where(o.class_subject_id, o.term_id)
    const p = who(o.student_id)
    const type = o.type as OccurrenceType
    occurrences.addRow([
      isoToBr(o.occurred_on),
      p.code,
      p.name,
      type === 'praise' ? 'Elogio' : 'Crítica',
      o.category,
      `${severityLabel(type, o.severity as Severity)} (${type === 'praise' ? '+' : '−'}${o.severity})`,
      o.description ?? '',
      w.subjectName,
      w.termName,
      w.year,
    ])
  }

  // ----------------------------------------------------- 5. fechamentos --
  const closures = sheetWith(wb, 'Fechamentos', [
    { header: 'Matrícula', width: 14 },
    { header: 'Nome completo', width: 34 },
    { header: 'Turma', width: 16 },
    { header: 'Disciplina', width: 20 },
    { header: 'Período', width: 18 },
    { header: 'Média calculada', width: 16 },
    { header: 'Nota final', width: 12 },
    { header: 'Ajustada', width: 10 },
    { header: 'Justificativa', width: 60 },
    { header: 'Saldo de conduta', width: 16 },
    { header: 'Frequência (%)', width: 14 },
    { header: 'Decidido em', width: 14 },
    { header: 'Ano letivo', width: 12 },
  ])
  for (const c of closuresRes.data ?? []) {
    const w = where(c.class_subject_id, c.term_id)
    const p = who(c.student_id)
    closures.addRow([
      p.code,
      p.name,
      w.className,
      w.subjectName,
      w.termName,
      Number(c.calculated_average),
      Number(c.final_grade),
      c.was_adjusted ? 'Sim' : 'Não',
      c.justification ?? '',
      c.conduct_score,
      c.attendance_pct === null ? '' : Number(c.attendance_pct),
      isoToBr(c.decided_at),
      w.year,
    ])
  }

  // ------------------------------------------------ 6. resultado do ano --
  const finals = sheetWith(wb, 'Resultado do ano', [
    { header: 'Matrícula', width: 14 },
    { header: 'Nome completo', width: 34 },
    { header: 'Turma', width: 16 },
    { header: 'Disciplina', width: 20 },
    { header: 'Média anual', width: 14 },
    { header: 'Frequência (%)', width: 14 },
    { header: 'Situação', width: 22 },
    { header: 'Observações', width: 40 },
    { header: 'Fechado em', width: 14 },
    { header: 'Ano letivo', width: 12 },
  ])
  const STATUS: Record<string, string> = {
    approved: 'Aprovado',
    recovery: 'Recuperação',
    failed: 'Reprovado',
    council_approved: 'Aprovado pelo conselho',
  }
  for (const f of finalsRes.data ?? []) {
    const w = where(f.class_subject_id, null)
    const p = who(f.student_id)
    finals.addRow([
      p.code,
      p.name,
      w.className,
      w.subjectName,
      f.annual_average === null ? '' : Number(f.annual_average),
      f.attendance_pct === null ? '' : Number(f.attendance_pct),
      STATUS[f.status] ?? f.status,
      f.notes ?? '',
      isoToBr(f.closed_at),
      yearById.get(f.school_year_id) ?? '',
    ])
  }

  // ----------------------------------------------- 7. estrutura da escola --
  const structure = sheetWith(wb, 'Turmas e disciplinas', [
    { header: 'Ano letivo', width: 12 },
    { header: 'Turma', width: 18 },
    { header: 'Disciplina', width: 24 },
  ])
  for (const [, offer] of offerById) {
    const cls = classById.get(offer.class_id)
    structure.addRow([
      cls ? (yearById.get(cls.school_year_id) ?? '') : '',
      cls?.name ?? '',
      offer.subjects?.name ?? '',
    ])
  }

  return {
    buffer: await wb.xlsx.writeBuffer(),
    schoolName: schoolRes.data?.name ?? 'ambiente',
    stats: {
      students: studentsRes.data?.length ?? 0,
      grades: gradesRes.data?.length ?? 0,
      occurrences: occurrencesRes.data?.length ?? 0,
      closures: closuresRes.data?.length ?? 0,
      attendance: attendanceRes.data?.length ?? 0,
    },
  }
}
