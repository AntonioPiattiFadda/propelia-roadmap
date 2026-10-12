const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

/** «1234,5 €» en es-ES (Intl no agrupa los miles de 4 cifras en este locale: es lo esperado). */
export const eur = (n: number): string => EUR.format(n)

/** Para rellenar un input: coma decimal y sin ceros inventados. `null` es vacío. */
export const montoAInput = (n: number | null): string => (n == null ? '' : String(n).replace('.', ','))

/**
 * Lo tipeado a número; NaN si no se entiende (también el vacío y los negativos: un monto es > 0).
 * La misma regla que la caja vieja, porque adivinar mal el punto multiplica un gasto por mil:
 * - Con coma, la coma es el decimal y los puntos son miles: «1.234,50» → 1234.5.
 * - Sin coma y con puntos: si calza exacto con grupos de tres («1.234», «12.345.678») son miles;
 *   si es dígitos, punto, dígitos («12.5») es el decimal de quien viene de un teclado numérico.
 *   Cualquier otra forma («1.2.3») es basura.
 * Se ignoran los espacios y el «€».
 */
export function parseMonto(texto: string): number {
  const t = texto.replace(/[\s€]/g, '')
  if (!t) return NaN
  if (t.includes(',')) {
    const partes = t.split(',')
    if (partes.length !== 2 || !/^\d+(\.\d+)*$/.test(partes[0]) || !/^\d+$/.test(partes[1])) return NaN
    return Number(`${partes[0].replace(/\./g, '')}.${partes[1]}`)
  }
  if (/^\d+$/.test(t)) return Number(t)
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  if (/^\d+\.\d+$/.test(t)) return Number(t)
  return NaN
}
