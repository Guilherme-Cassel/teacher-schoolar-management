'use client'

import { useState, useTransition } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { resetGradingConfig } from '@/lib/actions/grading'
import type { GradingConfig } from '@/lib/domain/grading'
import { GradingConfigForm } from '@/components/grading-config-form'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

/**
 * Regras de avaliação de uma disciplina numa turma.
 *
 * Quando não há regra própria, o formulário abre preenchido com o padrão da
 * escola — salvar ali é o que cria o desvio. Isso deixa a diferença explícita:
 * a professora vê de onde os valores vieram antes de mudá-los.
 */
export function SubjectRulesButton({
  classSubjectId,
  subjectName,
  className,
  config,
  hasOwn,
}: {
  classSubjectId: string
  subjectName: string
  className: string
  config: GradingConfig
  hasOwn: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function backToDefault() {
    setError(null)
    start(async () => {
      const r = await resetGradingConfig(classSubjectId)
      if (r.ok) setOpen(false)
      else setError(r.error)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={hasOwn ? 'Regras próprias desta disciplina' : 'Regras de avaliação'}
        aria-label={`Regras de ${subjectName}`}
        className={cn(
          'rounded-full p-0.5 transition-colors',
          hasOwn
            ? 'text-amber-600 hover:bg-amber-100'
            : 'text-brand-400 hover:bg-brand-100 hover:text-brand-700',
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${subjectName} — ${className}`}
        description={
          hasOwn
            ? 'Esta disciplina tem regras próprias, diferentes do padrão da escola.'
            : 'Seguindo o padrão da escola. Salvar aqui cria uma regra só para esta disciplina.'
        }
        className="w-[min(42rem,calc(100vw-2rem))]"
      >
        <div className="space-y-4">
          <GradingConfigForm
            config={config}
            classSubjectId={classSubjectId}
            submitLabel={hasOwn ? 'Salvar regras' : 'Criar regra própria'}
            onSaved={() => setOpen(false)}
          />

          {hasOwn && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-500">
                Voltar ao padrão apaga estas regras. Nenhuma nota é alterada.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={backToDefault}
                disabled={pending}
              >
                <RotateCcw className="h-4 w-4" />
                {pending ? 'Voltando...' : 'Voltar ao padrão da escola'}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </>
  )
}
