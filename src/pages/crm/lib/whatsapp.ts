import { toE164 } from '@/lib/phone'

/** El chat de WhatsApp con ese número y el mensaje ya escrito. Null si el número no es válido:
 *  inventarle un país abriría el chat de otra persona. Solo lleva texto, nunca un archivo.
 *  Con `web` va directo a WhatsApp Web: wa.me redirige por api.whatsapp.com antes de llegar ahí y en
 *  ese salto los emojis llegan rotos (�). En el móvil va wa.me, que abre la app. */
export function enlaceDeWhatsapp(telefono: string, texto: string, { web = false } = {}): string | null {
  const e164 = toE164(telefono)
  if (!e164) return null
  const numero = e164.replace(/\D/g, '')
  const t = encodeURIComponent(texto)
  return web ? `https://web.whatsapp.com/send?phone=${numero}&text=${t}` : `https://wa.me/${numero}?text=${t}`
}

/** Teléfono o tablet: ahí WhatsApp es la app, no WhatsApp Web. */
export const esMovil = (ua: string = navigator.userAgent) => /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
