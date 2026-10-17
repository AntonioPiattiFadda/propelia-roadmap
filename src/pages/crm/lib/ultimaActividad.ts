const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** La columna «Última actividad»: «Hoy», «Ayer», el día si fue esta semana (arranca el lunes) y la
 *  fecha si fue antes. Todo en hora local: es el día de quien mira, no el de la base. Sin ningún
 *  registro en la Actividad, «Sin contactar». */
export function fmtUltimaActividad(iso: string | null | undefined, ahora: Date = new Date()): string {
  if (!iso) return 'Sin contactar'
  const d = new Date(iso)
  const dia = inicioDelDia(d)
  const hoy = inicioDelDia(ahora)
  // Math.round y no la resta cruda: un cambio de horario hace que un día mida 23 o 25 horas.
  const diasAtras = Math.round((hoy.getTime() - dia.getTime()) / 86_400_000)

  if (diasAtras === 0) return 'Hoy'
  if (diasAtras === 1) return 'Ayer'
  const desdeElLunes = (hoy.getDay() + 6) % 7
  if (diasAtras > 1 && diasAtras <= desdeElLunes) return DIAS[d.getDay()]

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return d.getFullYear() === ahora.getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${String(d.getFullYear()).slice(2)}`
}
