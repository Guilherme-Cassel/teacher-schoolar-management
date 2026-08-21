'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'

export function ReportControls({
  classes,
  classId,
  kind,
  students,
  studentId,
}: {
  classes: { id: string; name: string }[]
  classId: string
  kind: string
  students: { id: string; name: string }[]
  studentId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}?${next.toString()}` as never)
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 no-print">
      <Select
        value={kind}
        onChange={(e) => setParam('tipo', e.target.value)}
        className="w-auto"
        aria-label="Tipo de relatório"
      >
        <option value="boletim">Boletim</option>
        <option value="conduta">Conduta da turma</option>
        <option value="historico">Histórico do aluno</option>
      </Select>

      <Select
        value={classId}
        onChange={(e) => setParam('turma', e.target.value)}
        className="w-auto"
        aria-label="Turma"
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select
        value={studentId}
        onChange={(e) => setParam('aluno', e.target.value)}
        className="w-auto min-w-48"
        aria-label="Aluno"
      >
        <option value="">Todos os alunos</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      <Button variant="secondary" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Imprimir / PDF
      </Button>
    </div>
  )
}
