'use client'

import { useState, useTransition } from 'react'
import { Download, Trash2, TriangleAlert } from 'lucide-react'
import { type YearContents, deleteSchoolYear } from '@/lib/actions/academic'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Field, Input } from '@/components/ui/field'

export function DeleteYearButton({
  yearId,
  year,
  contents,
}: {
  yearId: string
  year: number
  contents: YearContents
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const hasData =
    contents.classes > 0 ||
    contents.assessments > 0 ||
    contents.grades > 0 ||
    contents.occurrences > 0 ||
    contents.closures > 0

  const canDelete = !hasData || (typed.trim() === String(year) && downloaded)

  function close() {
    setOpen(false)
    setTyped('')
    setDownloaded(false)
    setError(null)
  }

  function remove() {
    setError(null)
    start(async () => {
      const r = await deleteSchoolYear(yearId, typed)
      if (r.ok) close()
      else setError(r.error)
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-rose-600 hover:bg-rose-50"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Excluir ano
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={`Excluir o ano letivo ${year}`}
        description="Esta ação não tem volta."
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {hasData ? (
                <>
                  <p className="font-medium">O ano {year} não está vazio</p>
                  <ul className="mt-1.5 space-y-0.5">
                    <li>{contents.terms} período(s)</li>
                    <li>{contents.classes} turma(s)</li>
                    <li>{contents.assessments} avaliação(ões)</li>
                    <li>{contents.grades} nota(s) lançada(s)</li>
                    <li>{contents.occurrences} ocorrência(s) de conduta</li>
                    <li>{contents.closures} fechamento(s) de período</li>
                  </ul>
                  <p className="mt-2">
                    A frequência e o resultado final do ano vão junto. Os alunos
                    continuam cadastrados, mas perdem tudo que foi lançado
                    neste ano.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">
                    O ano {year} só tem os {contents.terms} período(s) criados com ele
                  </p>
                  <p className="mt-1">
                    Nenhuma turma, nota ou ocorrência foi lançada — nada de
                    valor se perde.
                  </p>
                </>
              )}
            </div>
          </div>

          {hasData && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  1. Baixe os dados antes
                </p>
                <a
                  href="/api/configuracoes/backup"
                  download
                  onClick={() => setDownloaded(true)}
                >
                  <Button variant="secondary" className="w-full justify-center">
                    <Download className="h-4 w-4" />
                    Baixar tudo em planilha (.xlsx)
                  </Button>
                </a>
                <p className="mt-2 text-xs text-slate-500">
                  O backup cobre o ambiente inteiro, todos os anos — inclusive
                  este.
                </p>
              </div>

              <Field label={`2. Digite ${year} para confirmar`}>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={String(year)}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={!downloaded}
                />
              </Field>
            </>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={remove} disabled={!canDelete || pending}>
              <Trash2 className="h-4 w-4" />
              {pending ? 'Excluindo...' : 'Excluir ano letivo'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
