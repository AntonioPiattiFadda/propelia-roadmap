import { useState } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useDescartar } from '../hooks/useLeadMutaciones'
import { GRUPOS_DE_DESCARTE, MOTIVOS_DE_DESCARTE, type MotivoDescarte } from '../lib/motivosDescarte'

/**
 * El único diálogo de descarte. Lo abren las dos puertas —«Descartar» en el menú de la fila y elegir
 * la etapa Descartado en el dialog del lead— para que el motivo se elija igual de los dos lados.
 * Elegir un motivo es obligatorio. Cancelar no toca nada: el lead sigue en su etapa.
 */
export function DescartarLeadDialog({ leadId, etapa, onClose }: {
  leadId: string
  etapa: { id: string; label: string }
  onClose: () => void
}) {
  const descartar = useDescartar()
  const [motivo, setMotivo] = useState<MotivoDescarte | ''>('')

  const confirmar = () => {
    if (!motivo) return
    descartar.mutate({ leadId, etapaId: etapa.id, motivo })
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
        <RadioGroup value={motivo} onValueChange={v => setMotivo(v as MotivoDescarte)} className="gap-4" aria-label="Motivo del descarte">
          {GRUPOS_DE_DESCARTE.map(g => (
            <fieldset key={g.id} className="grid gap-2">
              <legend className="mb-1.5">
                <span className="text-[12.5px] font-semibold text-foreground">{g.label}</span>
                {g.detalle && <span className="block text-[12px] text-(--fg-muted)">{g.detalle}</span>}
              </legend>
              {MOTIVOS_DE_DESCARTE.filter(m => m.grupo === g.id).map(m => (
                <label key={m.code} className="flex cursor-pointer items-center gap-2 text-[13px] text-(--fg-2)">
                  <RadioGroupItem value={m.code} />
                  {m.label}
                </label>
              ))}
            </fieldset>
          ))}
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar} disabled={!motivo || descartar.isPending}>Descartar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
