import { shiftIsoDate } from '@/lib/calendarDate'

/* Los vencimientos rápidos de una tarea: hoy, los días hábiles que le quedan a esta semana y
   después saltos largos. Los días de la semana van hasta el viernes: una tarea del CRM es llamar a
   una inmobiliaria, y el fin de semana no atiende nadie. «Mañana» se dice así y no por su nombre,
   que es como se piensa. */

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const VIERNES = 5

export interface OpcionDeVencimiento {
  label: string
  value: string
}

function diaDeLaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getDay()
}

/** El mismo día del mes siguiente; si no existe (31 de enero), el último de ese mes. */
function enUnMes(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const ultimo = new Date(y, m + 1, 0).getDate()
  const fecha = new Date(y, m, Math.min(d, ultimo), 12)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export function opcionesDeVencimiento(today: string): OpcionDeVencimiento[] {
  const hoy = diaDeLaSemana(today)
  const restoDeLaSemana: OpcionDeVencimiento[] = []
  // Domingo (0) y sábado (6) no tienen hábiles por delante en esta semana.
  if (hoy >= 1 && hoy < VIERNES) {
    for (let dia = hoy + 1; dia <= VIERNES; dia++) {
      restoDeLaSemana.push({
        label: dia === hoy + 1 ? 'Mañana' : DIAS[dia],
        value: shiftIsoDate(today, dia - hoy),
      })
    }
  }
  return [
    { label: 'Hoy', value: today },
    ...restoDeLaSemana,
    { label: 'En 1 semana', value: shiftIsoDate(today, 7) },
    { label: 'En 2 semanas', value: shiftIsoDate(today, 14) },
    { label: 'En 1 mes', value: enUnMes(today) },
  ]
}
