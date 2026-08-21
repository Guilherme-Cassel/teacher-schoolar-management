import ExcelJS from 'exceljs'

/**
 * Dados do ambiente usados para pré-preencher o modelo. Turma, disciplina e
 * período viram lista suspensa na planilha: digitar "9A" onde o sistema tem
 * "9º A" é o erro mais provável, e é o que a lista elimina na origem.
 */
export interface TemplateContext {
  schoolName: string
  year: number
  classes: string[]
  subjects: string[]
  terms: string[]
  students: { fullName: string; registrationCode: string | null }[]
}

export const SHEET = {
  instructions: 'Instruções',
  students: 'Alunos',
  grades: 'Notas',
  attendance: 'Frequência',
  lists: 'Listas',
} as const

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1)
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  row.fill = HEADER_FILL
  row.height = 22
  row.alignment = { vertical: 'middle' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

/** Lista suspensa apontando para uma coluna da aba Listas. */
function dropdown(sheet: ExcelJS.Worksheet, column: string, listColumn: string, count: number) {
  if (count === 0) return
  for (let r = 2; r <= 500; r++) {
    sheet.getCell(`${column}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=${SHEET.lists}!$${listColumn}$2:$${listColumn}$${count + 1}`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Valor fora da lista',
      error: 'Use um dos valores cadastrados no sistema.',
    }
  }
}

export async function buildTemplate(ctx: TemplateContext): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Gestão Escolar'
  wb.created = new Date(Date.UTC(ctx.year, 0, 1))

  // ------------------------------------------------------------ instruções --
  const info = wb.addWorksheet(SHEET.instructions)
  info.columns = [{ width: 100 }]
  const lines: [string, boolean][] = [
    [`Importação de dados — ${ctx.schoolName} — ${ctx.year}`, true],
    ['', false],
    ['Como usar', true],
    ['1. Preencha apenas as abas Alunos, Notas e Frequência. Não renomeie as abas nem as colunas.', false],
    ['2. Turma, Disciplina e Período têm lista suspensa: escolha, não digite.', false],
    ['3. O aluno pode ser identificado pela Matrícula ou pelo Nome completo. A matrícula é mais segura.', false],
    ['4. Alunos que ainda não existem no sistema são criados a partir da aba Alunos.', false],
    ['5. Salve o arquivo e envie na tela de importação. Nada é gravado antes de você conferir a prévia.', false],
    ['', false],
    ['Sobre as notas', true],
    ['· Nota máxima é o valor que a avaliação vale (ex.: 10 para uma prova de 0 a 10).', false],
    ['· Peso é quanto ela pesa na média. Se todas valem igual, deixe 1 em todas.', false],
    ['· Para registrar falta na avaliação, escreva FALTA na coluna Nota.', false],
    ['· Avaliações com o mesmo nome, na mesma disciplina e período, são tratadas como a mesma avaliação.', false],
    ['', false],
    ['Sobre a frequência', true],
    ['· Aulas dadas é o total de aulas do período; Faltas é quantas o aluno perdeu.', false],
    ['· Faltas não pode ser maior que Aulas dadas.', false],
    ['', false],
    ['Períodos já encerrados', true],
    ['· Pode importar normalmente. O sistema abre uma exceção só para dados históricos.', false],
  ]
  for (const [text, bold] of lines) {
    const row = info.addRow([text])
    if (bold) row.font = { bold: true }
  }

  // ---------------------------------------------------------------- alunos --
  const students = wb.addWorksheet(SHEET.students)
  students.columns = [
    { header: 'Nome completo', key: 'name', width: 34 },
    { header: 'Matrícula', key: 'code', width: 14 },
    { header: 'Nascimento (DD/MM/AAAA)', key: 'birth', width: 24 },
    { header: 'Responsável', key: 'guardian', width: 28 },
    { header: 'Contato do responsável', key: 'contact', width: 24 },
    { header: 'Turma', key: 'class', width: 16 },
  ]
  styleHeader(students)
  dropdown(students, 'F', 'A', ctx.classes.length)

  // ----------------------------------------------------------------- notas --
  const grades = wb.addWorksheet(SHEET.grades)
  grades.columns = [
    { header: 'Matrícula', key: 'code', width: 14 },
    { header: 'Nome completo', key: 'name', width: 34 },
    { header: 'Turma', key: 'class', width: 16 },
    { header: 'Disciplina', key: 'subject', width: 20 },
    { header: 'Período', key: 'term', width: 18 },
    { header: 'Avaliação', key: 'assessment', width: 24 },
    { header: 'Peso', key: 'weight', width: 8 },
    { header: 'Nota máxima', key: 'max', width: 14 },
    { header: 'Nota', key: 'score', width: 10 },
  ]
  styleHeader(grades)
  dropdown(grades, 'C', 'A', ctx.classes.length)
  dropdown(grades, 'D', 'B', ctx.subjects.length)
  dropdown(grades, 'E', 'C', ctx.terms.length)

  // ------------------------------------------------------------ frequência --
  const attendance = wb.addWorksheet(SHEET.attendance)
  attendance.columns = [
    { header: 'Matrícula', key: 'code', width: 14 },
    { header: 'Nome completo', key: 'name', width: 34 },
    { header: 'Turma', key: 'class', width: 16 },
    { header: 'Disciplina', key: 'subject', width: 20 },
    { header: 'Período', key: 'term', width: 18 },
    { header: 'Aulas dadas', key: 'held', width: 14 },
    { header: 'Faltas', key: 'absences', width: 10 },
  ]
  styleHeader(attendance)
  dropdown(attendance, 'C', 'A', ctx.classes.length)
  dropdown(attendance, 'D', 'B', ctx.subjects.length)
  dropdown(attendance, 'E', 'C', ctx.terms.length)

  // --------------------------------------------------------------- listas --
  const lists = wb.addWorksheet(SHEET.lists)
  lists.columns = [
    { header: 'Turmas', key: 'classes', width: 20 },
    { header: 'Disciplinas', key: 'subjects', width: 22 },
    { header: 'Períodos', key: 'terms', width: 20 },
    { header: 'Alunos já cadastrados', key: 'students', width: 38 },
    { header: 'Matrícula', key: 'codes', width: 14 },
  ]
  styleHeader(lists)

  const rowCount = Math.max(
    ctx.classes.length,
    ctx.subjects.length,
    ctx.terms.length,
    ctx.students.length,
  )
  for (let i = 0; i < rowCount; i++) {
    lists.addRow({
      classes: ctx.classes[i] ?? null,
      subjects: ctx.subjects[i] ?? null,
      terms: ctx.terms[i] ?? null,
      students: ctx.students[i]?.fullName ?? null,
      codes: ctx.students[i]?.registrationCode ?? null,
    })
  }

  // A aba de listas alimenta as suspensas; deixá-la visível ajuda a conferir
  // os nomes exatos, mas ela fica por último para não competir com as de
  // preenchimento.
  return wb.xlsx.writeBuffer()
}
