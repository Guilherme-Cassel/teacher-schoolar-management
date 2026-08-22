import Link from 'next/link'
import { ArrowLeft, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, getGradingConfig } from '@/lib/data/context'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { GradingConfigForm } from '@/components/grading-config-form'

export const metadata = { title: 'Regras de avaliação' }

export default async function AvaliacaoPage() {
  const ctx = await getAppContext()
  if (!ctx) return null

  const config = await getGradingConfig(ctx.schoolId)
  const supabase = await createClient()

  // Disciplinas que fugiram do padrão — vale avisar, senão a professora muda
  // aqui e não entende por que uma delas continuou diferente.
  const { data: overrides } = await supabase
    .from('grading_configs')
    .select('class_subject_id, class_subjects(classes(name), subjects(name))')
    .eq('school_id', ctx.schoolId)
    .not('class_subject_id', 'is', null)

  const custom = ((overrides ?? []) as unknown as {
    class_subjects: { classes: { name: string } | null; subjects: { name: string } | null } | null
  }[])
    .map((o) =>
      o.class_subjects
        ? `${o.class_subjects.subjects?.name ?? '—'} (${o.class_subjects.classes?.name ?? '—'})`
        : null,
    )
    .filter((v): v is string => v !== null)

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/configuracoes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para configurações
      </Link>

      <PageHeader
        title="Regras de avaliação"
        description={`Padrão de ${ctx.schoolName}. Vale para todas as disciplinas que não tiverem regra própria.`}
      />

      {custom.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {custom.length} disciplina(s) com regra própria
            </p>
            <p className="mt-0.5">
              {custom.join(', ')} — essas não seguem o padrão daqui. Para ajustar
              cada uma, vá em <Link href="/turmas" className="underline">Turmas</Link>.
            </p>
          </div>
        </div>
      )}

      <Card className="p-5">
        <GradingConfigForm config={config} />
      </Card>

      <p className="mt-4 text-sm text-slate-500">
        Mudar estas regras afeta o cálculo das médias e a situação dos alunos em
        todas as telas, inclusive em períodos já fechados. As notas lançadas não
        mudam — o que muda é como elas são interpretadas.
      </p>
    </div>
  )
}
