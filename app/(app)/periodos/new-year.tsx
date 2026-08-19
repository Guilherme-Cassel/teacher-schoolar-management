'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createSchoolYear } from '@/lib/actions/academic'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select } from '@/components/ui/field'

export function NewYearButton() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const thisYear = new Date().getFullYear()

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Novo ano letivo
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo ano letivo"
        description="Os períodos são criados automaticamente; o primeiro já nasce aberto."
      >
        <form
          action={(fd) =>
            start(async () => {
              const r = await createSchoolYear(null, fd)
              if (r.ok) {
                setOpen(false)
                setError(null)
              } else {
                setError(r.error)
              }
            })
          }
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ano">
              <Input name="year" type="number" defaultValue={thisYear} required />
            </Field>
            <Field label="Divisão do ano">
              <Select name="divisions" defaultValue="4">
                <option value="4">4 bimestres</option>
                <option value="3">3 trimestres</option>
                <option value="2">2 semestres</option>
              </Select>
            </Field>
            <Field label="Início das aulas">
              <Input name="starts_on" type="date" />
            </Field>
            <Field label="Fim das aulas">
              <Input name="ends_on" type="date" />
            </Field>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Criar ano letivo
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
