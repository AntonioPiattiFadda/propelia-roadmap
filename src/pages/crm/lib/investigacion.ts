/* NUEVO. La investigación de Claude sobre la inmobiliaria (17/10/2026, por pedido): de todo el
   `sdr_advice` solo interesa quién trabaja ahí y a qué números llamar, y eso va en la pestaña de
   la inmobiliaria, abajo de las personas. El tip de la llamada y por qué se eligió no se muestran.
   El texto sigue entero en la base: se corta al leerlo, por los títulos que la importación exige
   (`SECCIONES_DEL_RESEARCH`) y los bloques que suma la RPC (`NUEVOS CONTACTOS`, `POSIBLE REPETIDA`). */

const QUE_SE_MUESTRA = ['PERSONAS DE LA EMPRESA', 'TELEFONOS DE CONTACTO', 'NUEVOS CONTACTOS']
const TITULOS = [...QUE_SE_MUESTRA, 'TIP PARA LA PRIMERA LLAMADA', 'POR QUE SE ELIGIO', 'POSIBLE REPETIDA']

const esTitulo = (linea: string) => TITULOS.some(t => linea.startsWith(t))
const seMuestra = (linea: string) => QUE_SE_MUESTRA.some(t => linea.startsWith(t))

/** Las secciones de personas y teléfonos del consejo, con su título; `null` si no trae ninguna. */
export function investigacionDeClaude(sdrAdvice: string | null | undefined): string | null {
  const bloques: string[][] = []
  let actual: string[] | null = null
  for (const linea of (sdrAdvice ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const limpia = linea.trim()
    if (esTitulo(limpia)) {
      actual = seMuestra(limpia) ? [limpia] : null
      if (actual) bloques.push(actual)
    } else if (actual) actual.push(linea.trimEnd())
  }
  const texto = bloques.map(b => b.join('\n').trim()).filter(Boolean).join('\n\n')
  return texto || null
}
