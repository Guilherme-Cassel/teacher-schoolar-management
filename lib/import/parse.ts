import ExcelJS from 'exceljs'
import { SHEET } from './template'

export interface ImportContext {
  classes: { id: string; name: string }[]
  /** Ofertas: a disciplina X na turma Y. */
  offers: { id: string; classId: string; className: string; subjectName: string }[]
  terms: { id: string; name: string }[]
  students: { id: string; fullName: string; registrationCode: string | null }[]
}

export interface RowIssue {
  sheet: string
  row: number
  field: string
  message: string
}

export interface ParsedStudent {
  row: number
  fullName: string
  registrationCode: string | null
  birthDate: string | null
  guardianName: string | null
  guardianContact: string | null
  classId: string | null
  /** Preenchido quando o aluno já existe no ambiente. */
  existingId: string | null
}

export interface ParsedGrade {
  row: number
  /** Identificação textual do aluno, resolvida para id na gravação. */
  studentRef: string
  studentId: string | null
  classSubjectId: string
  termId: string
  assessmentName: string
  weight: number
  maxScore: number
  score: number | null
  isAbsent: boolean
}

export interface ParsedAttendance {
  row: number
  studentRef: string
  studentId: string | null
  classSubjectId: string
  termId: string
  classesHeld: number
  absences: number
}

export interface ImportPreview {
  students: ParsedStudent[]
  grades: ParsedGrade[]
  attendance: ParsedAttendance[]
  issues: RowIssue[]
  summary: {
    newStudents: number
    knownStudents: number
    gradeRows: number
    attendanceRows: number
    newAssessments: number
  }
}

/**
 * Normaliza para comparação: sem acento, sem caixa, sem espaço duplicado.
 *
 * "José da Silva" e "JOSE DA  SILVA" precisam bater — a planilha vem digitada
 * à mão e a acentuação raramente é consistente.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acentuação separadas pelo NFD
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Texto de uma célula, seja qual for o tipo que o Excel guardou.
 *
 * O mesmo campo pode chegar como string, número, data ou objeto de fórmula
 * dependendo de como a professora preencheu — e um número de matrícula
 * digitado sem aspas vira number, não string.
 */
function cellText(cell: ExcelJS.Cell | undefined): string {
  const v = cell?.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v instanceof Date) {
    const d = String(v.getUTCDate()).padStart(2, '0')
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    return `${d}/${m}/${v.getUTCFullYear()}`
  }
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map((r) => r.text).join('').trim()
    if (o.text !== undefined) return String(o.text).trim()
    if (o.result !== undefined) return String(o.result).trim()
  }
  return String(v).trim()
}

/** Aceita "6,5" e "6.5". Devolve null quando vazio ou não numérico. */
function toNumber(text: string): number | null {
  if (text === '') return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** "DD/MM/AAAA" ou "AAAA-MM-DD" -> "AAAA-MM-DD". */
function toIsoDate(text: string): string | null {
  if (text === '') return null
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return text
  return null
}

/** Uma linha é vazia quando nenhuma coluna tem conteúdo. */
function isBlank(row: ExcelJS.Row, columns: number): boolean {
  for (let c = 1; c <= columns; c++) {
    if (cellText(row.getCell(c)) !== '') return false
  }
  return true
}

export async function parseImportWorkbook(
  data: ArrayBuffer,
  ctx: ImportContext,
): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data)

  const issues: RowIssue[] = []
  const students: ParsedStudent[] = []
  const grades: ParsedGrade[] = []
  const attendance: ParsedAttendance[] = []

  // ------------------------------------------------- índices de referência --
  const classByName = new Map(ctx.classes.map((c) => [normalize(c.name), c]))
  const termByName = new Map(ctx.terms.map((t) => [normalize(t.name), t]))

  const offerByKey = new Map(
    ctx.offers.map((o) => [`${normalize(o.className)}|${normalize(o.subjectName)}`, o]),
  )

  const studentByCode = new Map(
    ctx.students
      .filter((s) => s.registrationCode)
      .map((s) => [normalize(s.registrationCode!), s]),
  )

  // Nome pode repetir; guardamos a lista para detectar ambiguidade.
  const studentsByName = new Map<string, typeof ctx.students>()
  for (const s of ctx.students) {
    const key = normalize(s.fullName)
    const list = studentsByName.get(key) ?? []
    list.push(s)
    studentsByName.set(key, list)
  }

  // Alunos que a própria planilha está criando — grades podem referenciá-los.
  const incomingByCode = new Map<string, ParsedStudent>()
  const incomingByName = new Map<string, ParsedStudent[]>()

  // ------------------------------------------------------------- 1. alunos --
  const studentSheet = wb.getWorksheet(SHEET.students)
  if (studentSheet) {
    studentSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || isBlank(row, 6)) return

      const fullName = cellText(row.getCell(1))
      const code = cellText(row.getCell(2))
      const birthRaw = cellText(row.getCell(3))
      const className = cellText(row.getCell(6))

      if (fullName === '') {
        issues.push({
          sheet: SHEET.students,
          row: rowNumber,
          field: 'Nome completo',
          message: 'Obrigatório.',
        })
        return
      }

      const birthDate = birthRaw === '' ? null : toIsoDate(birthRaw)
      if (birthRaw !== '' && birthDate === null) {
        issues.push({
          sheet: SHEET.students,
          row: rowNumber,
          field: 'Nascimento',
          message: `"${birthRaw}" não é uma data. Use DD/MM/AAAA.`,
        })
      }

      let classId: string | null = null
      if (className !== '') {
        const found = classByName.get(normalize(className))
        if (!found) {
          issues.push({
            sheet: SHEET.students,
            row: rowNumber,
            field: 'Turma',
            message: `"${className}" não existe. Cadastre a turma antes de importar.`,
          })
        } else {
          classId = found.id
        }
      }

      // Já existe? Matrícula manda; nome só decide quando é único.
      let existingId: string | null = null
      if (code !== '' && studentByCode.has(normalize(code))) {
        existingId = studentByCode.get(normalize(code))!.id
      } else {
        const sameName = studentsByName.get(normalize(fullName)) ?? []
        if (sameName.length === 1 && code === '') {
          existingId = sameName[0].id
        } else if (sameName.length > 1) {
          issues.push({
            sheet: SHEET.students,
            row: rowNumber,
            field: 'Nome completo',
            message: `Há ${sameName.length} alunos com este nome no sistema. Informe a matrícula para dizer qual é.`,
          })
        }
      }

      const parsed: ParsedStudent = {
        row: rowNumber,
        fullName,
        registrationCode: code === '' ? null : code,
        birthDate,
        guardianName: cellText(row.getCell(4)) || null,
        guardianContact: cellText(row.getCell(5)) || null,
        classId,
        existingId,
      }

      students.push(parsed)
      if (parsed.registrationCode) incomingByCode.set(normalize(parsed.registrationCode), parsed)
      const nameKey = normalize(fullName)
      incomingByName.set(nameKey, [...(incomingByName.get(nameKey) ?? []), parsed])
    })
  }

  // Duplicidade dentro da própria planilha.
  const seenCodes = new Set<string>()
  for (const s of students) {
    if (!s.registrationCode) continue
    const key = normalize(s.registrationCode)
    if (seenCodes.has(key)) {
      issues.push({
        sheet: SHEET.students,
        row: s.row,
        field: 'Matrícula',
        message: `A matrícula "${s.registrationCode}" aparece mais de uma vez na planilha.`,
      })
    }
    seenCodes.add(key)
  }

  /**
   * Resolve o aluno de uma linha de Notas/Frequência.
   *
   * Devolve `undefined` quando não dá para saber quem é — o chamador já
   * registrou o problema e a linha não entra na importação.
   */
  function resolveStudent(
    sheet: string,
    row: number,
    code: string,
    name: string,
  ): { id: string | null; ref: string } | undefined {
    if (code !== '') {
      const key = normalize(code)
      const known = studentByCode.get(key)
      if (known) return { id: known.id, ref: code }
      if (incomingByCode.has(key)) return { id: null, ref: code }

      issues.push({
        sheet,
        row,
        field: 'Matrícula',
        message: `Matrícula "${code}" não existe e não está na aba ${SHEET.students}.`,
      })
      return undefined
    }

    if (name === '') {
      issues.push({
        sheet,
        row,
        field: 'Aluno',
        message: `Informe a matrícula ou o nome completo.`,
      })
      return undefined
    }

    const key = normalize(name)
    const known = studentsByName.get(key) ?? []
    if (known.length === 1) return { id: known[0].id, ref: name }
    if (known.length > 1) {
      issues.push({
        sheet,
        row,
        field: 'Nome completo',
        message: `Há ${known.length} alunos chamados "${name}". Use a matrícula.`,
      })
      return undefined
    }

    const incoming = incomingByName.get(key) ?? []
    if (incoming.length === 1) return { id: null, ref: name }
    if (incoming.length > 1) {
      issues.push({
        sheet,
        row,
        field: 'Nome completo',
        message: `"${name}" aparece ${incoming.length} vezes na aba ${SHEET.students}. Use a matrícula.`,
      })
      return undefined
    }

    issues.push({
      sheet,
      row,
      field: 'Aluno',
      message: `"${name}" não está cadastrado nem aparece na aba ${SHEET.students}.`,
    })
    return undefined
  }

  /** Resolve oferta (turma + disciplina) e período. */
  function resolveOfferAndTerm(
    sheet: string,
    row: number,
    className: string,
    subjectName: string,
    termName: string,
  ): { classSubjectId: string; termId: string } | undefined {
    let ok = true

    if (className === '') {
      issues.push({ sheet, row, field: 'Turma', message: 'Obrigatório.' })
      ok = false
    }
    if (subjectName === '') {
      issues.push({ sheet, row, field: 'Disciplina', message: 'Obrigatório.' })
      ok = false
    }
    if (termName === '') {
      issues.push({ sheet, row, field: 'Período', message: 'Obrigatório.' })
      ok = false
    }
    if (!ok) return undefined

    const offer = offerByKey.get(`${normalize(className)}|${normalize(subjectName)}`)
    if (!offer) {
      issues.push({
        sheet,
        row,
        field: 'Disciplina',
        message: `"${subjectName}" não está vinculada à turma "${className}". Faça o vínculo em Turmas antes de importar.`,
      })
      return undefined
    }

    const term = termByName.get(normalize(termName))
    if (!term) {
      issues.push({
        sheet,
        row,
        field: 'Período',
        message: `"${termName}" não é um período deste ano letivo.`,
      })
      return undefined
    }

    return { classSubjectId: offer.id, termId: term.id }
  }

  // -------------------------------------------------------------- 2. notas --
  const gradeSheet = wb.getWorksheet(SHEET.grades)
  const assessmentKeys = new Set<string>()

  if (gradeSheet) {
    gradeSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || isBlank(row, 9)) return

      const who = resolveStudent(
        SHEET.grades,
        rowNumber,
        cellText(row.getCell(1)),
        cellText(row.getCell(2)),
      )
      const where = resolveOfferAndTerm(
        SHEET.grades,
        rowNumber,
        cellText(row.getCell(3)),
        cellText(row.getCell(4)),
        cellText(row.getCell(5)),
      )

      const assessmentName = cellText(row.getCell(6))
      if (assessmentName === '') {
        issues.push({
          sheet: SHEET.grades,
          row: rowNumber,
          field: 'Avaliação',
          message: 'Obrigatório.',
        })
      }

      const weight = toNumber(cellText(row.getCell(7))) ?? 1
      const maxScore = toNumber(cellText(row.getCell(8)))
      const scoreRaw = cellText(row.getCell(9))

      if (weight <= 0) {
        issues.push({
          sheet: SHEET.grades,
          row: rowNumber,
          field: 'Peso',
          message: 'Precisa ser maior que zero.',
        })
      }
      if (maxScore === null || maxScore <= 0) {
        issues.push({
          sheet: SHEET.grades,
          row: rowNumber,
          field: 'Nota máxima',
          message: 'Informe quanto vale a avaliação (ex.: 10).',
        })
      }

      const isAbsent = /^(falta|faltou|f)$/i.test(scoreRaw)
      const score = isAbsent ? null : toNumber(scoreRaw)

      if (!isAbsent && scoreRaw !== '' && score === null) {
        issues.push({
          sheet: SHEET.grades,
          row: rowNumber,
          field: 'Nota',
          message: `"${scoreRaw}" não é um número. Use vírgula ou ponto, ou escreva FALTA.`,
        })
      }
      if (score !== null && maxScore !== null && (score < 0 || score > maxScore)) {
        issues.push({
          sheet: SHEET.grades,
          row: rowNumber,
          field: 'Nota',
          message: `${scoreRaw} está fora da escala 0–${maxScore}.`,
        })
      }

      if (!who || !where || assessmentName === '' || maxScore === null || maxScore <= 0) return
      // Linha sem nota e sem falta não tem o que gravar; a avaliação em si é
      // criada de qualquer forma pelas outras linhas.
      if (scoreRaw === '') return

      assessmentKeys.add(`${where.classSubjectId}|${where.termId}|${normalize(assessmentName)}`)

      grades.push({
        row: rowNumber,
        studentRef: who.ref,
        studentId: who.id,
        classSubjectId: where.classSubjectId,
        termId: where.termId,
        assessmentName,
        weight,
        maxScore,
        score,
        isAbsent,
      })
    })
  }

  // --------------------------------------------------------- 3. frequência --
  const attendanceSheet = wb.getWorksheet(SHEET.attendance)
  if (attendanceSheet) {
    attendanceSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || isBlank(row, 7)) return

      const who = resolveStudent(
        SHEET.attendance,
        rowNumber,
        cellText(row.getCell(1)),
        cellText(row.getCell(2)),
      )
      const where = resolveOfferAndTerm(
        SHEET.attendance,
        rowNumber,
        cellText(row.getCell(3)),
        cellText(row.getCell(4)),
        cellText(row.getCell(5)),
      )

      const held = toNumber(cellText(row.getCell(6)))
      const absences = toNumber(cellText(row.getCell(7)))

      if (held === null || held < 0 || !Number.isInteger(held)) {
        issues.push({
          sheet: SHEET.attendance,
          row: rowNumber,
          field: 'Aulas dadas',
          message: 'Informe um número inteiro de aulas.',
        })
      }
      if (absences === null || absences < 0 || !Number.isInteger(absences)) {
        issues.push({
          sheet: SHEET.attendance,
          row: rowNumber,
          field: 'Faltas',
          message: 'Informe um número inteiro de faltas.',
        })
      }
      if (held !== null && absences !== null && absences > held) {
        issues.push({
          sheet: SHEET.attendance,
          row: rowNumber,
          field: 'Faltas',
          message: `${absences} faltas em ${held} aulas dadas — o banco recusa faltas acima do total.`,
        })
      }

      if (!who || !where || held === null || absences === null || absences > held) return
      if (held < 0 || absences < 0) return

      attendance.push({
        row: rowNumber,
        studentRef: who.ref,
        studentId: who.id,
        classSubjectId: where.classSubjectId,
        termId: where.termId,
        classesHeld: held,
        absences,
      })
    })
  }

  const newStudents = students.filter((s) => !s.existingId).length

  return {
    students,
    grades,
    attendance,
    issues,
    summary: {
      newStudents,
      knownStudents: students.length - newStudents,
      gradeRows: grades.length,
      attendanceRows: attendance.length,
      newAssessments: assessmentKeys.size,
    },
  }
}
