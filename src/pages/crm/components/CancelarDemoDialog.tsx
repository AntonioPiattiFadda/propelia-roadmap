import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { CrmMeeting, CrmStage } from '../types'
import { CajaDeEtapa } from './FilasDelRegistro'
import { VerAvisoDeDemo } from './VerAvisoDeDemo'

/* Cancelar una demo desde su renglón de la actividad (23/10/2026, por pedido). Una demo que se cae
   cambia dónde está el lead, así que «El lead queda en» es obligatorio y arranca vacío, con la
   misma regla que al registrar una actividad: precargada, se confirmaría sin leerla. */
export function CancelarDemoDialog({ cuando, reunion, opciones, actual, cancelando, onCerrar, onConfirmar }: {
  /** «el 07/10 a las 12:00»: para qué demo es, dicho en el título. */
  cuando: string
  /** La demo: con ella, «Ver email» del aviso de cancelación que le llega al cliente. */
  reunion: Pick<CrmMeeting, 'lead_id' | 'starts_at' | 'guest_emails' | 'assigned_to'>
  opciones: CrmStage[]
  actual: CrmStage | undefined
  cancelando: boolean
  onCerrar: () => void
  onConfirmar: (v: { motivo: string | null; etapaId: string }) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [etapa, setEtapa] = useState('')
  const [faltaEtapa, setFaltaEtapa] = useState(false)

  const confirmar = () => {
    if (!etapa) { setFaltaEtapa(true); return }
    onConfirmar({ motivo: motivo.trim() || null, etapaId: etapa })
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !cancelando) onCerrar() }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Cancelar la demo del {cuando}</DialogTitle>
          <DialogDescription>
            Se borra del Google Calendar del responsable y, si los avisos están prendidos, le llega el mail al cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
            aria-label="Motivo de la cancelación" placeholder="Motivo (opcional)…" />
          <CajaDeEtapa valor={etapa} onCambiar={v => { setEtapa(v); setFaltaEtapa(false) }}
            opciones={opciones} actual={actual} rojo={faltaEtapa}
            aviso="Elegí en qué etapa queda antes de cancelar" />
          {new Date(reunion.starts_at) > new Date() && (
            <VerAvisoDeDemo tipo="demo_cancelled" leadId={reunion.lead_id} responsableId={reunion.assigned_to}
              inicio={reunion.starts_at} invitados={reunion.guest_emails ?? []} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={cancelando}>Volver</Button>
          <Button variant="destructive" onClick={confirmar} disabled={cancelando}>
            {cancelando ? 'Cancelando…' : 'Cancelar demo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
