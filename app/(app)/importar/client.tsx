'use client'

import { useRef, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react'
import { analyzeImport, commitImport } from '@/lib/actions/import'
import type { ImportPreview } from '@/lib/import/parse'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Step = 'upload' | 'preview' | 'done'

export function ImportWizard() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [written, setWritten] = useState<{
    students: number
    assessments: number
    grades: number
    attendance: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setWritten(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function analyze(selected: File) {
    setError(null)
    setFile(selected)
    start(async () => {
      const fd = new FormData()
      fd.set('arquivo', selected)
      const r = await analyzeImport(null, fd)
      if (r.ok) {
        setPreview(r.preview)
        setStep('preview')
      } else {
        setError(r.error)
      }
    })
  }

  function confirm() {
    if (!file) return
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.set('arquivo', file)
      const r = await commitImport(null, fd)
      if (r.ok) {
        setWritten(r.written)
        setStep('done')
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      <Steps current={step} />

      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {step === 'upload' && (
        <>
          <Card>
            <CardHeader
              title="1. Baixe o modelo"
              description="Ele já vem com suas turmas, disciplinas e períodos em lista suspensa."
            />
            <div className="px-5 pb-5">
              <a href="/api/importar/modelo" download>
                <Button variant="secondary">
                  <Download className="h-4 w-4" />
                  Baixar modelo (.xlsx)
                </Button>
              </a>
              <p className="mt-3 text-sm text-slate-500">
                Preencha as abas <strong>Alunos</strong>, <strong>Notas</strong> e{' '}
                <strong>Frequência</strong>. A aba Instruções explica cada coluna.
                Se você usa Google Sheets, baixe como Excel antes de enviar.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="2. Envie a planilha preenchida"
              description="Nada é gravado agora — você confere a prévia antes."
            />
            <div className="px-5 pb-5">
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg',
                  'border-2 border-dashed border-slate-300 px-6 py-10 text-center',
                  'hover:border-brand-400 hover:bg-brand-50/40',
                  pending && 'pointer-events-none opacity-60',
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) analyze(f)
                  }}
                />
                {pending ? (
                  <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                ) : (
                  <Upload className="h-8 w-8 text-slate-400" />
                )}
                <span className="font-medium text-slate-700">
                  {pending ? 'Conferindo a planilha...' : 'Escolher arquivo .xlsx'}
                </span>
                <span className="text-sm text-slate-500">Até 5 MB</span>
              </label>
            </div>
          </Card>
        </>
      )}

      {step === 'preview' && preview && (
        <PreviewStep
          preview={preview}
          fileName={file?.name ?? ''}
          pending={pending}
          onConfirm={confirm}
          onCancel={reset}
        />
      )}

      {step === 'done' && written && (
        <Card>
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-lg font-semibold text-slate-900">Importação concluída</p>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              {written.students} aluno(s) criado(s), {written.assessments} avaliação(ões),{' '}
              {written.grades} nota(s) e {written.attendance} registro(s) de frequência.
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" onClick={reset}>
                Importar outra planilha
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function Steps({ current }: { current: Step }) {
  const steps: [Step, string][] = [
    ['upload', 'Modelo e envio'],
    ['preview', 'Conferência'],
    ['done', 'Gravação'],
  ]
  const index = steps.findIndex(([s]) => s === current)

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {steps.map(([key, label], i) => (
        <li key={key} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
              i < index && 'bg-emerald-100 text-emerald-700',
              i === index && 'bg-brand-600 text-white',
              i > index && 'bg-slate-100 text-slate-400',
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === index ? 'font-medium text-slate-800' : 'text-slate-500')}>
            {label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 text-slate-300">→</span>}
        </li>
      ))}
    </ol>
  )
}

function PreviewStep({
  preview,
  fileName,
  pending,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview
  fileName: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { summary, issues } = preview
  const blocked = issues.length > 0

  return (
    <>
      <Card>
        <CardHeader
          title="O que vai ser importado"
          description={fileName}
          action={
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-slate-400" />
            </div>
          }
        />
        <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-5">
          <Stat label="Alunos novos" value={summary.newStudents} />
          <Stat label="Alunos já cadastrados" value={summary.knownStudents} />
          <Stat label="Avaliações" value={summary.newAssessments} />
          <Stat label="Notas" value={summary.gradeRows} />
          <Stat label="Frequência" value={summary.attendanceRows} />
        </dl>
      </Card>

      {blocked ? (
        <Card>
          <CardHeader
            title={`${issues.length} problema(s) para corrigir`}
            description="Nada foi gravado. Ajuste a planilha e envie de novo."
          />
          <div className="scroll-x max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Aba</th>
                  <th className="px-3 py-2 font-semibold">Linha</th>
                  <th className="px-3 py-2 font-semibold">Coluna</th>
                  <th className="px-3 py-2 font-semibold">Problema</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map((issue, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-600">{issue.sheet}</td>
                    <td className="tabular px-3 py-2 text-slate-600">{issue.row}</td>
                    <td className="px-3 py-2 text-slate-600">{issue.field}</td>
                    <td className="px-3 py-2 text-slate-800">{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Nenhum problema encontrado. Ao confirmar, os dados entram como se
            tivessem sido lançados normalmente — inclusive em períodos já
            encerrados.
          </p>
        </div>
      )}

      {!blocked && summary.gradeRows === 0 && summary.attendanceRows === 0 && summary.newStudents === 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A planilha não tem nada novo para importar.</p>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Enviar outra planilha
        </Button>
        <Button onClick={onConfirm} disabled={blocked || pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? 'Gravando...' : 'Confirmar importação'}
        </Button>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="tabular mt-0.5 text-xl font-semibold text-slate-900">{value}</dd>
    </div>
  )
}
