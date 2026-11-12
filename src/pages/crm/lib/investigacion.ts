/* NUEVO. La investigación de Claude sobre la inmobiliaria (17/10/2026, por pedido): de todo el
   `sdr_advice` solo interesa quién trabaja ahí y a qué números llamar, y eso va en la pestaña de
   la inmobiliaria, abajo de las personas. El tip de la llamada y por qué se eligió no se muestran.
   Desde el 12/11/2026 se edita (`conInvestigacionEditada`, abajo).
   El texto sigue entero en la base: se corta al leerlo, por los títulos que la importación exige
   (`SECCIONES_DEL_RESEARCH`) y los bloques que suma la RPC (`NUEVOS CONTACTOS`, `POSIBLE REPETIDA`). */

const QUE_SE_MUESTRA = ['PERSONAS DE LA EMPRESA', 'TELEFONOS DE CONTACTO', 'NUEVOS CONTACTOS']
const TITULOS = [...QUE_SE_MUESTRA, 'TIP PARA LA PRIMERA LLAMADA', 'POR QUE SE ELIGIO', 'POSIBLE REPETIDA']

const esTitulo = (linea: string) => TITULOS.some(t => linea.startsWith(t))
const seMuestra = (linea: string) => QUE_SE_MUESTRA.some(t => linea.startsWith(t))

const lineasDe = (texto: string | null | undefined) => (texto ?? '').replace(/\r\n?/g, '\n').split('\n')

/** Las secciones de personas y teléfonos del consejo, con su título; `null` si no trae ninguna. */
export function investigacionDeClaude(sdrAdvice: string | null | undefined): string | null {
  const bloques: string[][] = []
  let actual: string[] | null = null
  for (const linea of lineasDe(sdrAdvice)) {
    const limpia = linea.trim()
    if (esTitulo(limpia)) {
      actual = seMuestra(limpia) ? [limpia] : null
      if (actual) bloques.push(actual)
    } else if (actual) actual.push(linea.trimEnd())
  }
  const texto = bloques.map(b => b.join('\n').trim()).filter(Boolean).join('\n\n')
  return texto || null
}

/* Editarla (12/11/2026, por pedido): lo que se ve es un recorte del `sdr_advice`, así que guardar
   es volver a armarlo. Lo editado ocupa el lugar del primer bloque que se mostraba y los demás
   que se mostraban se van (ya venían adentro de lo editado); lo que no se muestra —el tip, por
   qué se eligió, «POSIBLE REPETIDA» y el texto suelto de antes del primer título— queda igual.
   Sin título arriba, lo escrito va bajo «PERSONAS DE LA EMPRESA»: si no, el recorte no lo
   encontraría y desaparecería de la pantalla al guardarlo. */
export function conInvestigacionEditada(sdrAdvice: string | null | undefined, editada: string): string | null {
  let texto = lineasDe(editada).map(l => l.trimEnd()).join('\n').trim()
  if (texto && !seMuestra(texto.split('\n')[0].trim())) texto = `${QUE_SE_MUESTRA[0]}\n${texto}`

  const bloques: { muestra: boolean; lineas: string[] }[] = [{ muestra: false, lineas: [] }]
  for (const linea of lineasDe(sdrAdvice)) {
    const limpia = linea.trim()
    if (esTitulo(limpia)) bloques.push({ muestra: seMuestra(limpia), lineas: [limpia] })
    else bloques[bloques.length - 1].lineas.push(linea.trimEnd())
  }

  const partes: string[] = []
  let puesta = false
  for (const b of bloques) {
    if (!b.muestra) partes.push(b.lineas.join('\n').trim())
    else if (!puesta) { partes.push(texto); puesta = true }
  }
  if (!puesta) partes.push(texto)
  return partes.filter(Boolean).join('\n\n') || null
}
