import { useState } from 'react'
import { ArrowLeft, Ban } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useDescartar } from '../hooks/useLeadMutaciones'
import { GRUPOS_DE_DESCARTE, MOTIVOS_DE_DESCARTE, type GrupoDescarte, type MotivoDescarte } from '../lib/motivosDescarte'

/**
 * El único diálogo de descarte. Lo abren las dos puertas —«Descartar» en el menú de la fila y elegir
 * la etapa Descartado en el dialog del lead— para que el motivo se elija igual de los dos lados.
 * Elegir un motivo es obligatorio. Cancelar no toca nada: el lead sigue en su etapa.
 *
 * Arranca en «podría calificar» (se lo vuelve a llamar en 6 meses) y el descarte definitivo queda
 * detrás de un cartel rojo: perder a alguien que podría volver tiene que costar un clic más.
 */
export function DescartarLeadDialog({ leadId, etapa, onClose }: {
  leadId: string
  etapa: { id: string; label: string }
  onClose: () => void
}) {
  const descartar = useDescartar()
  const [grupo, setGrupo] = useState<GrupoDescarte>('podria_calificar')
  const [motivo, setMotivo] = useState<MotivoDescarte | ''>('')
  const [razon, setRazon] = useState('')
  const paraSiempre = grupo === 'no_califica'
  const g = GRUPOS_DE_DESCARTE.find(x => x.id === grupo)!
  // El descarte para siempre se explica con palabras propias: un texto libre, sin grupo y sin recontacto.
  const elegido = paraSiempre ? razon.trim() : motivo

  const cambiarGrupo = (nuevo: GrupoDescarte) => {
    setGrupo(nuevo)
    setMotivo('')
    setRazon('')
  }

  const confirmar = () => {
    if (!elegido) return
    descartar.mutate({ leadId, etapaId: etapa.id, motivo: elegido })
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

        {paraSiempre ? (
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
          <RadioGroup value={motivo} onValueChange={v => setMotivo(v as MotivoDescarte)} className="gap-4" aria-label="Motivo del descarte">
            <fieldset className="grid gap-2">
              <legend className="mb-1.5">
                <span className="text-[12.5px] font-semibold text-foreground">{g.label}</span>
                {g.detalle && <span className="block text-[12px] text-(--fg-muted)">{g.detalle}</span>}
              </legend>
              {MOTIVOS_DE_DESCARTE.filter(m => m.grupo === grupo).map(m => (
                <label key={m.code} className="flex cursor-pointer items-center gap-2 text-[13px] text-(--fg-2)">
                  <RadioGroupItem value={m.code} />
                  {m.label}
                </label>
              ))}
            </fieldset>
          </RadioGroup>
        )}

        {paraSiempre ? (
          <button
            type="button"
            onClick={() => cambiarGrupo('podria_calificar')}
            className="flex w-fit items-center gap-1.5 text-[12.5px] text-(--fg-muted) hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Mejor no: podría calificar más adelante
          </button>
        ) : (
          <button
            type="button"
            onClick={() => cambiarGrupo('no_califica')}
            className="flex items-center gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-left text-destructive hover:bg-destructive/15"
          >
            <Ban className="size-4 shrink-0" />
            <span>
              <span className="block text-[13px] font-semibold">Descartar para siempre</span>
              <span className="block text-[12px] opacity-80">No califica ni calificará. No se lo vuelve a llamar.</span>
            </span>
          </button>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmar}
            disabled={!elegido || descartar.isPending}
            className={cn(paraSiempre && 'bg-destructive text-white hover:bg-destructive/90')}
          >
            {paraSiempre ? 'Descartar para siempre' : 'Descartar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
