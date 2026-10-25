/* Lo que se asienta en la actividad del lead cuando se manda un mensaje desde «Mensajes»
   (23/10/2026, por pedido): una nota a mano más, sin meta, así que se edita y se borra como
   cualquier nota. Se pregunta antes de escribirla: no todo envío es una gestión. */

export type EnvioDeMensaje = { canal: 'email' | 'whatsapp'; plantilla: string; destino: string }

const CANAL: Record<EnvioDeMensaje['canal'], string> = { email: 'Email', whatsapp: 'WhatsApp' }

export function textoDelEnvio({ canal, plantilla, destino }: EnvioDeMensaje): string {
  return `${CANAL[canal]} «${plantilla}» enviado a ${destino.trim()}`
}
