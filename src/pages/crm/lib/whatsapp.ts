import { toE164 } from '@/lib/phone'

/** El chat de WhatsApp con ese número y el mensaje ya escrito (wa.me abre WhatsApp Web en el
 *  ordenador y la app en el móvil). Null si el número no es válido: inventarle un país abriría el
 *  chat de otra persona. wa.me solo lleva texto, nunca un archivo. */
export function enlaceDeWhatsapp(telefono: string, texto: string): string | null {
  const e164 = toE164(telefono)
  if (!e164) return null
  return `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`
}
