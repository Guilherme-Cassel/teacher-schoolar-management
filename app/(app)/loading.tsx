import { Loader2 } from 'lucide-react'

/**
 * As telas consultam o Supabase no servidor. Sem isto a navegação fica sem
 * retorno visual enquanto carrega, e a sensação é de app travado.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        Carregando...
      </div>
    </div>
  )
}
