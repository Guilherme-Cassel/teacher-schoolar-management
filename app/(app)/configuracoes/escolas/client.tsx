'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Download, LogIn, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import {
  type SchoolContents,
  deleteSchool,
  renameSchool,
  switchSchool,
} from '@/lib/actions/schools'
import type { SchoolOption } from '@/lib/data/context'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<SchoolOption['role'], string> = {
  admin: 'Administradora',
  coordinator: 'Coordenação',
  teacher: 'Professora',
}

export function SchoolList({
  schools,
  currentId,
  contents,
}: {
  schools: SchoolOption[]
  currentId: string
  contents: SchoolContents
}) {
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<SchoolOption | null>(null)
  const [deleting, setDeleting] = useState<SchoolOption | null>(null)
  const [pending, start] = useTransition()

  function enter(id: string) {
    setError(null)
    start(async () => {
      const r = await switchSchool(id)
      if (r && !r.ok) setError(r.error)
    })
  }

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {schools.map((s) => {
          const isCurrent = s.id === currentId
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'truncate font-medium',
                      isCurrent ? 'text-brand-700' : 'text-slate-800',
                    )}
                  >
                    {s.name}
                  </p>
                  {isCurrent && (
                    <Badge tone="brand">
                      <Check className="h-3 w-3" />
                      Ativo
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{ROLE_LABEL[s.role]}</p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {isCurrent ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRenaming(s)}
                      disabled={pending}
                    >
                      <Pencil className="h-4 w-4" />
                      Renomear
                    </Button>
                    {s.role === 'admin' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50"
                        onClick={() => setDeleting(s)}
                        disabled={pending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" onClick={() => enter(s.id)} disabled={pending}>
                    <LogIn className="h-4 w-4" />
                    Entrar
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {error && <p className="px-5 pb-4 text-sm text-rose-600">{error}</p>}

      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        Só é possível excluir o ambiente em que você está. Para excluir outro,
        entre nele primeiro.
      </p>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renomear ambiente"
        description="Muda apenas o nome exibido. Nenhum dado é afetado."
      >
        <form
          action={(fd) =>
            start(async () => {
              const r = await renameSchool(null, fd)
              if (r.ok) {
                setRenaming(null)
                setError(null)
              } else {
                setError(r.error)
              }
            })
          }
          className="space-y-4"
        >
          <Field label="Nome da escola">
            <Input name="name" defaultValue={renaming?.name ?? ''} required minLength={2} />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>

      <DeleteModal
        school={deleting}
        contents={contents}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

function DeleteModal({
  school,
  contents,
  onClose,
}: {
  school: SchoolOption | null
  contents: SchoolContents
  onClose: () => void
}) {
  const router = useRouter()
  const [downloaded, setDownloaded] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const total =
    contents.students + contents.grades + contents.occurrences + contents.closures
  const nameMatches =
    school !== null &&
    typed.trim().replace(/\s+/g, ' ').toLowerCase() ===
      school.name.trim().replace(/\s+/g, ' ').toLowerCase()

  // Ambiente vazio não tem o que exportar; exigir o download ali seria só
  // um obstáculo sem propósito.
  const backupRequired = total > 0
  const canDelete = nameMatches && (!backupRequired || downloaded)

  function close() {
    setDownloaded(false)
    setTyped('')
    setError(null)
    onClose()
  }

  function remove() {
    if (!school) return
    setError(null)
    start(async () => {
      const r = await deleteSchool(school.id, typed)
      if (r.ok) {
        close()
        router.push('/painel')
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <Modal
      open={school !== null}
      onClose={close}
      title="Excluir ambiente"
      description="Esta ação não tem volta."
    >
      {school && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                Tudo de <strong>{school.name}</strong> será apagado
              </p>
              {total > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                  <li>{contents.students} aluno(s)</li>
                  <li>{contents.grades} nota(s) lançada(s)</li>
                  <li>{contents.occurrences} ocorrência(s) de conduta</li>
                  <li>{contents.closures} fechamento(s) de período</li>
                </ul>
              ) : (
                <p className="mt-1">Este ambiente ainda está vazio.</p>
              )}
              <p className="mt-2">
                Turmas, disciplinas, anos letivos e frequência vão junto. Não há
                lixeira nem desfazer.
              </p>
            </div>
          </div>

          {backupRequired && (
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
                Alunos, notas, frequência, ocorrências, fechamentos e resultados
                do ano. As abas de alunos, notas e frequência seguem o formato do
                Importar dados — dá para trazer tudo de volta depois.
              </p>
              {downloaded && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  Download iniciado. Confira o arquivo antes de continuar.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {backupRequired ? '2. ' : ''}Confirme digitando{' '}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                {school.name}
              </span>
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={school.name}
              autoComplete="off"
              disabled={backupRequired && !downloaded}
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={remove} disabled={!canDelete || pending}>
              <Trash2 className="h-4 w-4" />
              {pending ? 'Excluindo...' : 'Excluir para sempre'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
