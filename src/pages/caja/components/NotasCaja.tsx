import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ID_NOTAS_CAJA, useGuardarNotasDeCaja, useNotasDeCaja } from '../hooks/useNotasDeCaja'

const ESPERA_MS = 700
const PLACEHOLDER = 'Anotá lo que no es un gasto: un pago a confirmar, algo para preguntar…'

/* Un cuadro de texto libre para lo que no es un gasto (un pago a confirmar, algo que hay que
   preguntar). Se guarda solo, con retraso y al salir del campo; mientras hay un borrador sin
   confirmar, gana sobre lo que trae la base, así no se pisa lo que se está escribiendo.
   `id` es la fila de `roadmap_notas`: cada cuadro de la Caja tiene la suya. */
export function NotasCaja({ id = ID_NOTAS_CAJA, titulo = 'Notas', placeholder = PLACEHOLDER, className, campoClassName }: {
  id?: string
  titulo?: string
  placeholder?: string
  className?: string
  campoClassName?: string
}) {
  const { data: guardado = '', isPending, isError } = useNotasDeCaja(id)
  const guardar = useGuardarNotasDeCaja(id)
  const campoId = `caja-${id}`
  const [borrador, setBorrador] = useState<string | null>(null)
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(espera.current), [])

  const persistir = (texto: string, alTerminar?: () => void) =>
    guardar.mutate(texto, {
      onSuccess: alTerminar,
      onError: () => toast.error('No se pudieron guardar las notas de la caja'),
    })

  const alEscribir = (texto: string) => {
    setBorrador(texto)
    clearTimeout(espera.current)
    espera.current = setTimeout(() => persistir(texto), ESPERA_MS)
  }

  const alSalir = () => {
    clearTimeout(espera.current)
    if (borrador === null) return
    if (borrador === guardado) setBorrador(null)
    else persistir(borrador, () => setBorrador(null))
  }

  const estado = guardar.isPending ? 'Guardando…' : guardar.isError ? 'Sin guardar' : borrador !== null ? '' : 'Guardado'

  return (
    <section className={className}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={campoId} className="text-[11px] font-medium uppercase tracking-wide text-(--fg-muted)">{titulo}</label>
        {!isPending && !isError && <span className="text-[11px] text-(--fg-faint)">{estado}</span>}
      </div>
      {isError ? (
        <p role="alert" className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-danger">No se pudieron cargar las notas.</p>
      ) : (
        <Textarea
          id={campoId}
          value={borrador ?? guardado}
          disabled={isPending}
          onChange={e => alEscribir(e.target.value)}
          onBlur={alSalir}
          placeholder={isPending ? 'Cargando…' : placeholder}
          className={cn('min-h-[96px] resize-y bg-card text-sm', campoClassName)}
        />
      )}
    </section>
  )
}
