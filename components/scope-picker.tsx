'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Select } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'

interface Offer {
  id: string
  className: string
  subjectName: string
}

interface Term {
  id: string
  name: string
  status: 'planned' | 'open' | 'closed'
}

/**
 * Seletor de turma+disciplina e período, compartilhado por Notas,
 * Ocorrências e Fechamento. O estado vive na URL, então a seleção
 * sobrevive a recarregar a página e pode ser compartilhada por link.
 */
export function ScopePicker({
  offers,
  terms,
  offerId,
  termId,
}: {
  offers: Offer[]
  terms: Term[]
  offerId: string | null
  termId: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.replace(`${pathname}?${next.toString()}` as never)
  }

  const term = terms.find((t) => t.id === termId)

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 no-print">
      <Select
        value={offerId ?? ''}
        onChange={(e) => setParam('oferta', e.target.value)}
        className="w-auto min-w-56"
        aria-label="Turma e disciplina"
      >
        {offers.length === 0 && <option value="">Nenhuma turma com disciplina</option>}
        {offers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.className} · {o.subjectName}
          </option>
        ))}
      </Select>

      <Select
        value={termId ?? ''}
        onChange={(e) => setParam('periodo', e.target.value)}
        className="w-auto min-w-40"
        aria-label="Período letivo"
      >
        {terms.length === 0 && <option value="">Nenhum período</option>}
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>

      {term?.status === 'closed' && (
        <Badge tone="amber">
          <Lock className="h-3 w-3" />
          Período fechado
        </Badge>
      )}
      {term?.status === 'planned' && <Badge tone="slate">Ainda não aberto</Badge>}
    </div>
  )
}
