/* Los WhatsApp del onboarding: el texto sale de `onboarding_message_templates` y se completa acá.
   Variables: {nombre} (el responsable), {soporte} (quien envía), {inmobiliaria} y {link} (el de
   pago, o en el primer contacto el de la página de alta). Una variable sin valor queda escrita tal cual: mejor verla en la vista previa que
   mandar un hueco. */

export type VariablesDeMensaje = { nombre: string; soporte: string; inmobiliaria: string; link?: string }

export function llenarPlantilla(cuerpo: string, v: VariablesDeMensaje): string {
  const valores: Record<string, string | undefined> = { nombre: v.nombre, soporte: v.soporte, inmobiliaria: v.inmobiliaria, link: v.link }
  return cuerpo.replace(/\{(nombre|soporte|inmobiliaria|link)\}/g, (todo, clave: string) => valores[clave]?.trim() || todo)
}

/** El nombre de pila: el saludo es «¡Hola Marta!», no «¡Hola Marta Gil!». */
export const nombreDePila = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? ''
