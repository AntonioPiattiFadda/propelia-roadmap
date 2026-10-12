import { etiquetaDeMotivo, fmtFechaCompleta } from './motivosDescarte'

/* El `systemComment.ts` del producto es el parser de los comentarios del inbound de Idealista:
   acá no hay inbound. Lo que sí se trae es el texto que deja `reassign_leads` del producto
   ('(Sistema) Lead reasignado de X a Y'), sin el «(Sistema)»: acá lo dice `comment_type`.
   Un solo lugar para estos textos: la actividad es el registro que se lee después, y el mismo
   hecho no puede quedar escrito de dos formas según la puerta por la que entró. */
export function comentarioReasignacion(de: string, a: string): string {
  return `Lead reasignado de ${de} a ${a}.`
}

/** `motivo` es el código del catálogo (se escribe su etiqueta) o un texto libre viejo. */
export function comentarioDescarte(motivo: string | null, recontactoDesde: string | null = null): string {
  const etiqueta = etiquetaDeMotivo(motivo)
  if (!etiqueta) return 'Lead descartado. Sin motivo especificado.'
  const base = `Lead descartado. Motivo: ${etiqueta}`
  return recontactoDesde ? `${base}. Volver a llamar desde ${fmtFechaCompleta(recontactoDesde)}.` : base
}
