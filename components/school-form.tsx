'use client'

import { useState, useTransition } from 'react'
import { School } from 'lucide-react'
import { createSchool } from '@/lib/actions/schools'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'

/** Fusos que cobrem o Brasil. A esmagadora maioria fica no primeiro. */
const TIMEZONES = [
  ['America/Sao_Paulo', 'Brasília (GMT-3)'],
  ['America/Manaus', 'Manaus (GMT-4)'],
  ['America/Cuiaba', 'Cuiabá (GMT-4)'],
  ['America/Rio_Branco', 'Rio Branco (GMT-5)'],
  ['America/Noronha', 'Fernando de Noronha (GMT-2)'],
] as const

export function SchoolForm({ submitLabel = 'Criar ambiente' }: { submitLabel?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      action={(fd) =>
        start(async () => {
          // Em caso de sucesso a action redireciona e nada volta para cá.
          const r = await createSchool(null, fd)
          if (r && !r.ok) setError(r.error)
        })
      }
      className="space-y-4"
    >
      <Field
        label="Nome da escola"
        hint="Como você reconhece esse lugar no dia a dia. Ex.: Escola Municipal Vila Nova."
      >
        <Input name="name" required minLength={2} autoFocus placeholder="Escola Municipal Vila Nova" />
      </Field>

      <Field label="Fuso horário" hint="Usado nas datas de ocorrências e fechamentos.">
        <Select name="timezone" defaultValue="America/Sao_Paulo">
          {TIMEZONES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        <School className="h-4 w-4" />
        {pending ? 'Criando…' : submitLabel}
      </Button>
    </form>
  )
}
