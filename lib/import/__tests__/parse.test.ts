import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { type ImportContext, normalize, parseImportWorkbook } from '../parse'
import { SHEET, buildTemplate } from '../template'

const CTX: ImportContext = {
  classes: [{ id: 'class-9a', name: '9º A' }],
  offers: [
    { id: 'offer-mat', classId: 'class-9a', className: '9º A', subjectName: 'Matemática' },
    { id: 'offer-port', classId: 'class-9a', className: '9º A', subjectName: 'Português' },
  ],
  terms: [
    { id: 'term-1', name: '1º Bimestre' },
    { id: 'term-2', name: '2º Bimestre' },
  ],
  students: [
    { id: 'stu-ana', fullName: 'Ana Beatriz Ferreira', registrationCode: '2024087' },
    { id: 'stu-joao1', fullName: 'João Silva', registrationCode: '2024001' },
    { id: 'stu-joao2', fullName: 'João Silva', registrationCode: '2024002' },
  ],
}

/** Monta uma planilha com a mesma estrutura do modelo distribuído. */
async function workbook(sheets: {
  students?: unknown[][]
  grades?: unknown[][]
  attendance?: unknown[][]
}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()

  const s = wb.addWorksheet(SHEET.students)
  s.addRow(['Nome completo', 'Matrícula', 'Nascimento', 'Responsável', 'Contato', 'Turma'])
  for (const row of sheets.students ?? []) s.addRow(row)

  const g = wb.addWorksheet(SHEET.grades)
  g.addRow(['Matrícula', 'Nome', 'Turma', 'Disciplina', 'Período', 'Avaliação', 'Peso', 'Nota máxima', 'Nota'])
  for (const row of sheets.grades ?? []) g.addRow(row)

  const a = wb.addWorksheet(SHEET.attendance)
  a.addRow(['Matrícula', 'Nome', 'Turma', 'Disciplina', 'Período', 'Aulas dadas', 'Faltas'])
  for (const row of sheets.attendance ?? []) a.addRow(row)

  return wb.xlsx.writeBuffer()
}

describe('normalize', () => {
  it('ignora acento, caixa e espaço repetido', () => {
    expect(normalize('José da  SILVA')).toBe('jose da silva')
    expect(normalize('  Matemática ')).toBe('matematica')
  })
})

describe('parseImportWorkbook — alunos', () => {
  it('reconhece aluno já existente pela matrícula', async () => {
    const buf = await workbook({
      students: [['Ana Beatriz Ferreira', '2024087', '', '', '', '9º A']],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.students[0].existingId).toBe('stu-ana')
    expect(r.summary.newStudents).toBe(0)
    expect(r.summary.knownStudents).toBe(1)
  })

  it('trata aluno desconhecido como novo', async () => {
    const buf = await workbook({
      students: [['Carlos Mendes', '2024999', '05/09/2010', 'Rita Mendes', '11999998888', '9º A']],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.students[0].existingId).toBeNull()
    expect(r.students[0].birthDate).toBe('2010-09-05')
    expect(r.students[0].classId).toBe('class-9a')
    expect(r.summary.newStudents).toBe(1)
  })

  it('recusa data que não é data', async () => {
    const buf = await workbook({ students: [['Carlos Mendes', '', '30 de maio', '', '', '']] })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(1)
    expect(r.issues[0].field).toBe('Nascimento')
  })

  it('recusa turma que não existe', async () => {
    const buf = await workbook({ students: [['Carlos Mendes', '', '', '', '', '9A']] })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues.some((i) => i.field === 'Turma')).toBe(true)
  })

  it('aponta nome ambíguo em vez de escolher um dos dois', async () => {
    // Dois "João Silva" no sistema: adivinhar colaria nota no aluno errado.
    const buf = await workbook({ students: [['João Silva', '', '', '', '', '9º A']] })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues.some((i) => i.message.includes('2 alunos'))).toBe(true)
  })

  it('acusa matrícula repetida dentro da própria planilha', async () => {
    const buf = await workbook({
      students: [
        ['Carlos Mendes', '2024999', '', '', '', ''],
        ['Carla Mendes', '2024999', '', '', '', ''],
      ],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues.some((i) => i.field === 'Matrícula')).toBe(true)
  })

  it('ignora linhas em branco no meio da planilha', async () => {
    const buf = await workbook({
      students: [
        ['Carlos Mendes', '2024999', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['Diana Souza', '2024998', '', '', '', ''],
      ],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.students).toHaveLength(2)
  })
})

describe('parseImportWorkbook — notas', () => {
  const grade = (over: Partial<Record<number, unknown>> = {}) => {
    const base: unknown[] = ['2024087', '', '9º A', 'Matemática', '1º Bimestre', 'Prova 1', 1, 10, 8]
    for (const [i, v] of Object.entries(over)) base[Number(i)] = v
    return base
  }

  it('importa uma nota válida', async () => {
    const r = await parseImportWorkbook(await workbook({ grades: [grade()] }), CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.grades).toHaveLength(1)
    expect(r.grades[0]).toMatchObject({
      studentId: 'stu-ana',
      classSubjectId: 'offer-mat',
      termId: 'term-1',
      assessmentName: 'Prova 1',
      score: 8,
      isAbsent: false,
    })
    expect(r.summary.newAssessments).toBe(1)
  })

  it('aceita nota com vírgula', async () => {
    const r = await parseImportWorkbook(await workbook({ grades: [grade({ 8: '7,5' })] }), CTX)
    expect(r.issues).toHaveLength(0)
    expect(r.grades[0].score).toBe(7.5)
  })

  it('entende FALTA como ausência, não como erro', async () => {
    const r = await parseImportWorkbook(await workbook({ grades: [grade({ 8: 'FALTA' })] }), CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.grades[0].isAbsent).toBe(true)
    expect(r.grades[0].score).toBeNull()
  })

  it('recusa nota acima da escala', async () => {
    const r = await parseImportWorkbook(await workbook({ grades: [grade({ 8: 12 })] }), CTX)
    expect(r.issues.some((i) => i.field === 'Nota')).toBe(true)
  })

  it('recusa disciplina que não está vinculada à turma', async () => {
    const r = await parseImportWorkbook(
      await workbook({ grades: [grade({ 3: 'Geografia' })] }),
      CTX,
    )
    expect(r.issues.some((i) => i.field === 'Disciplina')).toBe(true)
    expect(r.grades).toHaveLength(0)
  })

  it('recusa período de outro ano letivo', async () => {
    const r = await parseImportWorkbook(
      await workbook({ grades: [grade({ 4: '5º Bimestre' })] }),
      CTX,
    )
    expect(r.issues.some((i) => i.field === 'Período')).toBe(true)
  })

  it('recusa matrícula que não existe nem está sendo criada', async () => {
    const r = await parseImportWorkbook(await workbook({ grades: [grade({ 0: '9999' })] }), CTX)
    expect(r.issues.some((i) => i.message.includes('9999'))).toBe(true)
    expect(r.grades).toHaveLength(0)
  })

  it('aceita nota de aluno que a própria planilha está criando', async () => {
    const buf = await workbook({
      students: [['Carlos Mendes', '2024999', '', '', '', '9º A']],
      grades: [grade({ 0: '2024999' })],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.grades[0].studentId).toBeNull() // resolvido na gravação
    expect(r.grades[0].studentRef).toBe('2024999')
  })

  it('conta avaliações repetidas como uma só', async () => {
    // A mesma prova aparece uma vez por aluno; criar uma avaliação por linha
    // encheria o boletim de colunas duplicadas.
    const buf = await workbook({
      grades: [grade(), grade({ 0: '2024001' }), grade({ 0: '2024002' })],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.grades).toHaveLength(3)
    expect(r.summary.newAssessments).toBe(1)
  })
})

describe('parseImportWorkbook — frequência', () => {
  it('importa frequência válida', async () => {
    const buf = await workbook({
      attendance: [['2024087', '', '9º A', 'Matemática', '1º Bimestre', 40, 3]],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.attendance[0]).toMatchObject({
      studentId: 'stu-ana',
      classSubjectId: 'offer-mat',
      classesHeld: 40,
      absences: 3,
    })
  })

  it('recusa mais faltas do que aulas dadas', async () => {
    // O banco tem CHECK (absences <= classes_held): sem barrar aqui, a
    // importação quebraria no meio da gravação.
    const buf = await workbook({
      attendance: [['2024087', '', '9º A', 'Matemática', '1º Bimestre', 10, 12]],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues.some((i) => i.field === 'Faltas')).toBe(true)
    expect(r.attendance).toHaveLength(0)
  })

  it('recusa número quebrado de aulas', async () => {
    const buf = await workbook({
      attendance: [['2024087', '', '9º A', 'Matemática', '1º Bimestre', 40.5, 2]],
    })
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues.some((i) => i.field === 'Aulas dadas')).toBe(true)
  })
})

describe('buildTemplate', () => {
  const TEMPLATE_CTX = {
    schoolName: 'Escola Municipal Vila Nova',
    year: 2026,
    classes: ['9º A'],
    subjects: ['Matemática', 'Português'],
    terms: ['1º Bimestre', '2º Bimestre'],
    students: [{ fullName: 'Ana Beatriz Ferreira', registrationCode: '2024087' }],
  }

  it('gera as abas que o parser espera', async () => {
    const buf = await buildTemplate(TEMPLATE_CTX)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)

    for (const name of Object.values(SHEET)) {
      expect(wb.getWorksheet(name), `aba ${name}`).toBeDefined()
    }
  })

  it('o modelo recém-baixado volta sem erro pelo parser', async () => {
    // Fecha o ciclo: o arquivo que a professora baixa precisa ser aceito de
    // volta vazio, senão ela recebe erro antes mesmo de digitar qualquer coisa.
    const buf = await buildTemplate(TEMPLATE_CTX)
    const r = await parseImportWorkbook(buf, CTX)

    expect(r.issues).toHaveLength(0)
    expect(r.students).toHaveLength(0)
    expect(r.grades).toHaveLength(0)
    expect(r.attendance).toHaveLength(0)
  })

  it('leva turmas, disciplinas e períodos para a aba de listas', async () => {
    const buf = await buildTemplate(TEMPLATE_CTX)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const lists = wb.getWorksheet(SHEET.lists)!

    expect(lists.getCell('A2').value).toBe('9º A')
    expect(lists.getCell('B2').value).toBe('Matemática')
    expect(lists.getCell('C2').value).toBe('1º Bimestre')
    expect(lists.getCell('D2').value).toBe('Ana Beatriz Ferreira')
  })
})
