import { MessageCircle } from 'lucide-react'
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
import { enlaceDeAvisoDeDemo, mensajeDeDemoAgendada, WHATSAPP_AVISO_DE_DEMO, type DemoAgendada } from '../lib/avisoDeDemo'
import { esMovil } from '../lib/whatsapp'

/** Al terminar de agendar una demo (23/10/2026, por pedido): ofrece avisarla por WhatsApp a Propelia
 *  con el mensaje ya escrito. No manda nada solo: el botón abre el chat y el envío lo hace quien agenda. */
export function DemoAgendadaDialog({ demo, onCerrar }: {
  /** La demo recién agendada; `null` = cerrado. */
  demo: DemoAgendada | null
  onCerrar: () => void
}) {
  return (
    <AlertDialog open={!!demo} onOpenChange={o => { if (!o) onCerrar() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¡Demo agendada! 🎉</AlertDialogTitle>
          <AlertDialogDescription>Avisala por WhatsApp al {WHATSAPP_AVISO_DE_DEMO} con este mensaje:</AlertDialogDescription>
        </AlertDialogHeader>
        {demo && (
          <p className="max-h-72 overflow-y-auto whitespace-pre-line rounded-md bg-(--surface-2) p-3 text-[12.5px] leading-relaxed text-(--fg-2)">
            {mensajeDeDemoAgendada(demo)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cerrar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (demo) window.open(enlaceDeAvisoDeDemo(demo, { web: !esMovil() }), '_blank', 'noopener') }}>
            <MessageCircle className="size-4" />
            Avisar por WhatsApp
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
