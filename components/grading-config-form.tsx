'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { saveGradingConfig } from '@/lib/actions/grading'
import type { GradingConfig } from '@/lib/domain/grading'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { formatGrade } from '@/lib/utils'

/** Número para leitura: vírgula decimal, e sem casas quando é inteiro. */
function pretty(value: number): string {
  return Number.isInteger(value) ? String(value) : formatGrade(value, 1)
}

const METHOD_LABEL: Record<GradingConfig['method'], string> = {
  weighted: 'Média ponderada (cada avaliação tem um peso)',
  arithmetic: 'Média simples (todas valem igual)',
  points_sum: 'Soma de pontos (o total das avaliações é a nota)',
}

/**
 * Formulário de regras de avaliação.
 *
 * Serve tanto para o padrão da escola quanto para o ajuste de uma disciplina:
 * a diferença é o `classSubjectId`, que vai junto e define o alcance.
 *
 * Deliberadamente NÃO expõe recovery_passing_grade nem recovery_formula: as
 * colunas existem no banco, mas nenhum cálculo as lê. Um controle que não
 * muda resultado nenhum é pior que a ausência dele — a professora ajustaria
 * e não entenderia por que nada mudou.
 */
export function GradingConfigForm({
  config,
  classSubjectId,
  onSaved,
  submitLabel = 'Salvar regras',
}: {
  config: GradingConfig
  classSubjectId?: string
  onSaved?: () => void
  submitLabel?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  return (
    <form
      action={(fd) => {
        if (classSubjectId) fd.set('class_subject_id', classSubjectId)
        start(async () => {
          const r = await saveGradingConfig(null, fd)
          if (r.ok) {
            setError(null)
            setSaved(true)
            onSaved?.()
          } else {
            setSaved(false)
            setError(r.error)
          }
        })
      }}
      className="space-y-5"
    >
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Aprovação</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nota para aprovação"
            hint={`De 0 a ${pretty(config.maxGrade)}. Abaixo disso o aluno não passa.`}
          >
            <Input
              name="passing_grade"
              type="number"
              step="0.1"
              min="0"
              defaultValue={config.passingGrade}
              required
            />
          </Field>

          <Field
            label="Frequência mínima (%)"
            hint="Abaixo disso, reprova por falta mesmo com nota boa."
          >
            <Input
              name="min_attendance_pct"
              type="number"
              step="1"
              min="0"
              max="100"
              defaultValue={config.minAttendancePct}
              required
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">Cálculo da média</h3>

        <Field label="Como a média é calculada">
          <Select name="method" defaultValue={config.method}>
            {(Object.keys(METHOD_LABEL) as GradingConfig['method'][]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nota máxima"
            hint="A escala das notas. Avaliações com escala diferente são convertidas."
          >
            <Input
              name="max_grade"
              type="number"
              step="0.1"
              min="0.1"
              defaultValue={config.maxGrade}
              required
            />
          </Field>

          <Field label="Casas decimais" hint="Como a média é arredondada.">
            <Select name="decimal_places" defaultValue={String(config.decimalPlaces)}>
              <option value="0">Nenhuma (7)</option>
              <option value="1">Uma (7,5)</option>
              <option value="2">Duas (7,50)</option>
              <option value="3">Três (7,500)</option>
            </Select>
          </Field>
        </div>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="has_recovery"
            defaultChecked={config.hasRecovery}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            A escola tem recuperação
            <span className="block text-xs text-slate-500">
              Quem fica abaixo da média aparece como &quot;Recuperação&quot; em vez de
              &quot;Reprovado&quot;.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Sugestão no fechamento</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Quando o aluno fica perto da média, o sistema cruza a distância que
            falta, a frequência e o saldo de conduta para sugerir um ajuste.
            Ele nunca decide sozinho — a palavra final é sempre sua.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Tolerância de ajuste"
            hint={`Quanto pode faltar para a média e ainda assim sugerir ajuste. Ex.: ${pretty(config.adjustTolerance)} ponto(s).`}
          >
            <Input
              name="adjust_tolerance"
              type="number"
              step="0.1"
              min="0"
              defaultValue={config.adjustTolerance}
              required
            />
          </Field>

          <Field
            label="Saldo de conduta mínimo"
            hint="Saldo necessário para o ajuste ser sugerido."
          >
            <Input
              name="conduct_threshold"
              type="number"
              step="1"
              defaultValue={config.conductThreshold}
              required
            />
          </Field>
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
        {saved && !pending && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <Check className="h-4 w-4" />
            Regras salvas
          </span>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
