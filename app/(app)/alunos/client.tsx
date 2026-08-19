'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus, Search, Upload, UserRound } from 'lucide-react'
import { importStudents, saveStudent, setStudentActive } from '@/lib/actions/registry'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'

interface ClassOption {
  id: string
  name: string
}

interface StudentRow {
  id: string
  full_name: string
  registration_code: string | null
  guardian_name: string | null
  guardian_contact: string | null
  is_active: boolean
  enrollments: { id: string; class_id: string; classes: { id: string; name: string } | null }[]
}

// ------------------------------------------------------------ cadastro ----

function StudentForm({
  student,
  classes,
  onDone,
}: {
  student: StudentRow | null
  classes: ClassOption[]
  onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={(fd) => {
        if (student) fd.set('id', student.id)
        start(async () => {
          const r = await saveStudent(null, fd)
          if (r.ok) {
            setError(null)
            onDone()
          } else {
            setError(r.error)
          }
        })
      }}
      className="space-y-4"
    >
      <Field label="Nome completo">
        <Input name="full_name" required autoFocus defaultValue={student?.full_name ?? ''} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matrícula" hint="Opcional, mas ajuda a evitar duplicidade.">
          <Input name="registration_code" defaultValue={student?.registration_code ?? ''} />
        </Field>
        <Field label="Data de nascimento">
          <Input name="birth_date" type="date" />
        </Field>
        <Field label="Responsável">
          <Input name="guardian_name" defaultValue={student?.guardian_name ?? ''} />
        </Field>
        <Field label="Contato do responsável">
          <Input name="guardian_contact" defaultValue={student?.guardian_contact ?? ''} />
        </Field>
      </div>

      {classes.length > 0 && (
        <Field label="Matricular na turma" hint="Deixe em branco para matricular depois.">
          <Select name="class_id" defaultValue="">
            <option value="">Não matricular agora</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Observações">
        <Textarea name="notes" rows={2} placeholder="Anotações gerais sobre o aluno." />
      </Field>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {student ? 'Salvar alterações' : 'Cadastrar aluno'}
        </Button>
      </div>
    </form>
  )
}

export function NewStudentButton({ classes }: { classes: ClassOption[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Novo aluno
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo aluno">
        <StudentForm student={null} classes={classes} onDone={() => setOpen(false)} />
      </Modal>
    </>
  )
}

// ------------------------------------------------------------ importação ----

export function ImportButton({ classes }: { classes: ClassOption[] }) {
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [classId, setClassId] = useState('')
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  function run() {
    start(async () => {
      const r = await importStudents(classId || null, raw)
      setResult({ created: r.created, skipped: r.skipped, errors: r.errors })
      if (r.created > 0) setRaw('')
    })
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Importar
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setResult(null)
        }}
        title="Importar alunos da planilha"
        description="Copie a coluna de nomes no Excel e cole aqui."
        className="w-[min(40rem,calc(100vw-2rem))]"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="mb-1 font-medium text-slate-700">Formatos aceitos (um aluno por linha):</p>
            <code className="block">Ana Beatriz Souza</code>
            <code className="block">Ana Beatriz Souza;0001</code>
            <code className="block">Ana Beatriz Souza;0001;Maria Souza;(11) 90000-0000</code>
            <p className="mt-1">Separador: vírgula, ponto e vírgula ou tabulação. Cabeçalho é ignorado.</p>
          </div>

          {classes.length > 0 && (
            <Field label="Matricular todos na turma">
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Não matricular agora</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Lista de alunos">
            <Textarea
              rows={9}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'Ana Beatriz Souza\nBruno Carvalho Lima\nCarla Menezes Rocha'}
              className="font-mono text-xs"
            />
          </Field>

          {result && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-700">
                <strong className="text-emerald-700">{result.created}</strong> aluno(s) importado(s).
                {result.skipped > 0 && (
                  <>
                    {' '}
                    <strong className="text-amber-700">{result.skipped}</strong> ignorado(s) por
                    matrícula duplicada.
                  </>
                )}
              </p>
              {result.errors.length > 0 && (
                <ul className="list-inside list-disc text-xs text-rose-600">
                  {result.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {result.errors.length > 8 && <li>... e mais {result.errors.length - 8}.</li>}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false)
                setResult(null)
              }}
            >
              Fechar
            </Button>
            <Button onClick={run} disabled={pending || raw.trim() === ''}>
              {pending ? 'Importando...' : 'Importar'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ----------------------------------------------------------------- tabela ----

export function StudentTable({
  students,
  classes,
  activeClass,
  search,
}: {
  students: StudentRow[]
  classes: ClassOption[]
  activeClass: string
  search: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [editing, setEditing] = useState<StudentRow | null>(null)
  const [, start] = useTransition()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`/alunos?${next.toString()}` as never)
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              defaultValue={search}
              placeholder="Buscar por nome..."
              className="pl-9"
              onKeyDown={(e) => {
                if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
              }}
            />
          </div>

          {classes.length > 0 && (
            <Select
              value={activeClass}
              onChange={(e) => setParam('turma', e.target.value)}
              className="w-auto"
            >
              <option value="">Todas as turmas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}

          <span className="text-sm text-slate-500">
            {students.length} {students.length === 1 ? 'aluno' : 'alunos'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Aluno</th>
                <th className="px-4 py-2 font-semibold">Matrícula</th>
                <th className="px-4 py-2 font-semibold">Turmas</th>
                <th className="px-4 py-2 font-semibold">Responsável</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.id} className={s.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={{ pathname: `/alunos/${s.id}` }}
                      className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand-700"
                    >
                      <UserRound className="h-4 w-4 text-slate-300" />
                      {s.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 tabular text-slate-500">
                    {s.registration_code ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {s.enrollments.length === 0 ? (
                        <span className="text-xs text-amber-600">Sem turma</span>
                      ) : (
                        s.enrollments.map((e) => (
                          <Badge key={e.id} tone="brand">
                            {e.classes?.name ?? '—'}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {s.guardian_name ?? '—'}
                    {s.guardian_contact && (
                      <span className="block text-xs text-slate-400">{s.guardian_contact}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(s)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => start(() => void setStudentActive(s.id, !s.is_active))}
                      >
                        {s.is_active ? 'Desativar' : 'Reativar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {students.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Nenhum aluno encontrado com esses filtros.
          </p>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar aluno">
        {editing && (
          <StudentForm student={editing} classes={classes} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  )
}
