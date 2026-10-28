/* Los WhatsApp del onboarding: el texto sale de `onboarding_message_templates` y se completa acá.
   Variables: {nombre} (el responsable), {soporte} (quien envía), {inmobiliaria}, {link} (el de
   pago, o en el primer contacto el de la página de alta) y {mails} (los mails de accesos que no
   llegaron, en `corregir_mails`). Una variable sin valor queda escrita tal cual: mejor verla en la
   vista previa que mandar un hueco. */

export type VariablesDeMensaje = { nombre: string; soporte: string; inmobiliaria: string; link?: string; mails?: string }

export function llenarPlantilla(cuerpo: string, v: VariablesDeMensaje): string {
  const valores: Record<string, string | undefined> = { nombre: v.nombre, soporte: v.soporte, inmobiliaria: v.inmobiliaria, link: v.link, mails: v.mails }
  return cuerpo.replace(/\{(nombre|soporte|inmobiliaria|link|mails)\}/g, (todo, clave: string) => valores[clave]?.trim() || todo)
}

/** El nombre de pila: el saludo es «¡Hola Marta!», no «¡Hola Marta Gil!». */
export const nombreDePila = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? ''

type Persona = { first_name: string; last_name: string; email: string | null }

/** {mails} de `corregir_mails`: un renglón por dirección que no llegó, con el nombre de quien la
 *  cargó si es del equipo. Sin repetir: un mail reenviado que vuelve a rebotar es el mismo. */
export function listaDeMailsQueNoLlegaron(emails: string[], equipo: Persona[]): string {
  const vistos = new Set<string>()
  return emails.flatMap(e => {
    const clave = e.trim().toLowerCase()
    if (!clave || vistos.has(clave)) return []
    vistos.add(clave)
    const p = equipo.find(m => m.email?.trim().toLowerCase() === clave)
    const nombre = p ? `${p.first_name} ${p.last_name}`.trim() : ''
    return [nombre ? `• ${nombre}: ${e.trim()}` : `• ${e.trim()}`]
  }).join('\n')
}
