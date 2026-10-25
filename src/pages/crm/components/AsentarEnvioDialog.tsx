import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CRM_KEYS } from '../hooks/keys'
import { mensajeDeError } from '../lib/errores'
import { textoDelEnvio, type EnvioDeMensaje } from '../lib/envioDeMensaje'
import { crearComentario } from '../service/crm.service'

/** Después de mandar un email o un WhatsApp desde «Mensajes»: tapa la pantalla y pregunta si el envío
 *  queda en la actividad del lead. Modal a propósito (no se cierra tocando afuera): la respuesta se da
 *  en el momento o no se da. «No» no deja nada. */
export function AsentarEnvioDialog({ leadId, envio, onCerrar }: {
  leadId: string
  /** El envío recién hecho; `null` = cerrado. */
  envio: EnvioDeMensaje | null
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const asentar = useMutation({
    mutationFn: (e: EnvioDeMensaje) => crearComentario({ lead_id: leadId, description: textoDelEnvio(e) }),
    onSuccess: () => {
      toast.success('Actividad registrada')
      void qc.invalidateQueries({ queryKey: CRM_KEYS.detalle(leadId) })
    },
    onError: (error) => { toast.error(`No se registró la actividad: ${mensajeDeError(error)}`) },
  })

  return (
    <AlertDialog open={!!envio} onOpenChange={o => { if (!o) onCerrar() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Registrar la actividad?</AlertDialogTitle>
          <AlertDialogDescription>
            Queda en la actividad del lead como una nota: «{envio ? textoDelEnvio(envio) : ''}».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (envio) asentar.mutate(envio) }}>Registrar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
