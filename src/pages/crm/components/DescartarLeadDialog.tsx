import { useState } from 'react'
import { ArrowLeft, Ban, RotateCcw } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useDescartar } from '../hooks/useLeadMutaciones'
import { GRUPOS_DE_DESCARTE, type GrupoDescarte } from '../lib/motivosDescarte'

/**
 * El único diálogo de descarte. Lo abren las dos puertas —«Descartar» en el menú de la fila y elegir
 * la etapa Descartado en el dialog del lead— para que el motivo se elija igual de los dos lados.
 * Cancelar no toca nada: el lead sigue en su etapa.
 *
 * Primero pregunta si cualifica (17/11/2026, por pedido):
 * - «Podría calificar»: la objeción real del cliente, escrita a mano y obligatoria (19/11/2026, por
 *   pedido: hasta ese día eran los motivos del catálogo como opciones); lleva el recontacto a 6 meses.
 * - «No califica ni calificará»: el descarte definitivo, con el motivo escrito a mano y obligatorio.
 */
export function DescartarLeadDialog({ leadId, etapa, onClose }: {
  leadId: string
  etapa: { id: string; label: string }
  onClose: () => void
}) {
  const descartar = useDescartar()
  const [grupo, setGrupo] = useState<GrupoDescarte | null>(null)
  const [razon, setRazon] = useState('')
  const paraSiempre = grupo === 'no_califica'
  const g = grupo ? GRUPOS_DE_DESCARTE.find(x => x.id === grupo)! : null
  const elegido = razon.trim()

  const elegirGrupo = (nuevo: GrupoDescarte | null) => {
    setGrupo(nuevo)
    setRazon('')
  }

  const confirmar = () => {
    if (!grupo || !elegido) return
    descartar.mutate({ leadId, etapaId: etapa.id, motivo: elegido, grupo })
    onClose()
  }

  return (
    <AlertDialog open onOpenChange={abierto => { if (!abierto) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Descartar este lead?</AlertDialogTitle>
          <AlertDialogDescription>
            Pasa a «{etapa.label}». El motivo queda en el lead y en su actividad.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!g ? (
          <div className="grid gap-2">
            <span className="text-[12.5px] font-semibold text-foreground">¿Cualifica?</span>
            <button
              type="button"
              onClick={() => elegirGrupo('podria_calificar')}
              className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left hover:bg-muted"
            >
              <RotateCcw className="size-4 shrink-0 text-(--fg-muted)" />
              <span>
                <span className="block text-[13px] font-semibold text-foreground">Podría calificar</span>
                <span className="block text-[12px] text-(--fg-muted)">Hoy no, pero volvemos a llamarlo en 6 meses.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => elegirGrupo('no_califica')}
              className="flex items-center gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-left text-destructive hover:bg-destructive/15"
            >
              <Ban className="size-4 shrink-0" />
              <span>
                <span className="block text-[13px] font-semibold">No califica ni calificará</span>
                <span className="block text-[12px] opacity-80">Descarte definitivo. No se lo vuelve a llamar.</span>
              </span>
            </button>
          </div>
        ) : paraSiempre ? (
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-semibold text-destructive">{g.label}</span>
            <Textarea
              autoFocus
              value={razon}
              onChange={e => setRazon(e.target.value)}
              placeholder="¿Por qué no califica ni calificará?"
              aria-label="Motivo del descarte"
              className="min-h-20 text-[13px]"
            />
          </label>
        ) : (
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-semibold text-foreground">{g.label}</span>
            {g.detalle && <span className="text-[12px] text-(--fg-muted)">{g.detalle}</span>}
            <span className="rounded-md bg-(--brand-soft) px-2.5 py-2 text-[12px] text-(--brand-soft-fg)">
              Escribí la <b>objeción real del cliente</b>, con sus palabras: qué te dijo y por qué hoy no.
              «No le interesa» no sirve para volver a llamarlo dentro de 6 meses.
            </span>
            <Textarea
              autoFocus
              value={razon}
              onChange={e => setRazon(e.target.value)}
              placeholder="Ej.: «Acaban de renovar con Inmovilla por un año; les parece caro pagar dos CRM.»"
              aria-label="Objeción del cliente"
              className="min-h-20 text-[13px]"
            />
          </label>
        )}

        {g && (
          <button
            type="button"
            onClick={() => elegirGrupo(null)}
            className="flex w-fit items-center gap-1.5 text-[12.5px] text-(--fg-muted) hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Volver a «¿Cualifica?»
          </button>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {g && (
            <AlertDialogAction
              onClick={confirmar}
              disabled={!elegido || descartar.isPending}
              className={cn(paraSiempre && 'bg-destructive text-white hover:bg-destructive/90')}
            >
              {paraSiempre ? 'Descartar para siempre' : 'Descartar'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
