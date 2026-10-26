import { Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { enlaceDeWhatsapp, esMovil } from '@/pages/crm/lib/whatsapp'

export async function copiarTexto(texto: string, aviso = 'Copiado'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    toast.success(aviso)
    return true
  } catch {
    toast.error('No se pudo copiar')
    return false
  }
}

/* Copiar y enviar un WhatsApp: los dos íconos que van al lado de la tarea. Enviar también copia,
   por si WhatsApp Web corta el texto o abre otro chat. En el ordenador va directo a WhatsApp Web
   (wa.me rompe los emojis), en el teléfono a la app: `enlaceDeWhatsapp`, como «Mensajes» del CRM.
   Nunca lleva un archivo: el Excel se adjunta a mano en el chat. */
export function EnviarPorWhatsapp({ texto, telefono }: { texto: string | null; telefono: string | null }) {
  const enviar = async () => {
    if (!texto) return
    const url = telefono ? enlaceDeWhatsapp(telefono, texto, { web: !esMovil() }) : null
    if (!url) {
      toast.error('El responsable no tiene un teléfono válido', { description: 'Copiá el mensaje y mandalo a mano.' })
      return
    }
    await navigator.clipboard.writeText(texto).catch(() => {})
    window.open(url, '_blank', 'noopener')
  }
  const sinTexto = texto ? undefined : 'Falta la plantilla en la base (onboarding_message_templates)'
  return (
    <>
      <Button size="icon" variant="outline" className="size-8" disabled={!texto} title={sinTexto ?? 'Copiar mensaje'}
        aria-label="Copiar mensaje" onClick={() => texto && void copiarTexto(texto, 'Mensaje copiado')}>
        <Copy className="size-4" />
      </Button>
      <Button size="icon" variant="outline" className="size-8" disabled={!texto} title={sinTexto ?? 'Copiar y abrir WhatsApp'}
        aria-label="Copiar y abrir WhatsApp" onClick={() => void enviar()}>
        <Send className="size-4" />
      </Button>
    </>
  )
}
