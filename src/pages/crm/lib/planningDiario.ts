/* El planning diario del SDR: dos jornadas fijas, una por horario de España. La jornada en
   España es siempre 10:00 → 19:00; lo que se mueve es la hora de Venezuela (diferencia 6 h en
   verano, 5 h en invierno). */

export type Horario = 'verano' | 'invierno'

export type TipoDeBloque = 'contactar' | 'seguimiento' | 'pausa' | 'capacitacion' | 'revision'

export interface Bloque {
  vzla: string
  espana: string
  tipo: TipoDeBloque
  titulo: string
  duracion: string
}

export interface Jornada {
  titulo: string
  bajada: string
  bloques: Bloque[]
  /** Dónde termina el último bloque. */
  fin: { vzla: string; espana: string }
}

/** Qué horario rige en España en ese instante. Lo decide el huso de Europe/Madrid y no una
 *  fecha escrita a mano: el cambio cae el último domingo de marzo y de octubre, cada año. */
export function horarioDeEspana(fecha: Date = new Date()): Horario {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' })
    .formatToParts(fecha)
    .find(p => p.type === 'timeZoneName')?.value
  return offset === 'GMT+2' ? 'verano' : 'invierno'
}

/* Los bloques en hora de España son los mismos todo el año. */
const BLOQUES: Omit<Bloque, 'vzla'>[] = [
  { espana: '10:00', tipo: 'contactar', titulo: 'Por contactar', duracion: '2 h 30' },
  { espana: '12:30', tipo: 'seguimiento', titulo: 'Seguimientos y tareas', duracion: '30 min' },
  { espana: '13:00', tipo: 'contactar', titulo: 'Por contactar', duracion: '1 h' },
  { espana: '14:00', tipo: 'pausa', titulo: 'Pausa', duracion: '1 h' },
  { espana: '15:00', tipo: 'capacitacion', titulo: 'Capacitación', duracion: '20 min' },
  { espana: '15:20', tipo: 'revision', titulo: 'Revisión tareas último día', duracion: '20 min' },
  { espana: '15:40', tipo: 'seguimiento', titulo: 'Seguimientos y tareas', duracion: '30 min' },
  { espana: '16:10', tipo: 'contactar', titulo: 'Por contactar', duracion: '2 h 50' },
]
const FIN_ESPANA = '19:00'

function restarHoras(hora: string, horas: number): string {
  const [h, m] = hora.split(':').map(Number)
  return `${String((h - horas + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function jornada(titulo: string, bajada: string, diferencia: number): Jornada {
  return {
    titulo,
    bajada,
    bloques: BLOQUES.map(b => ({ ...b, vzla: restarHoras(b.espana, diferencia) })),
    fin: { vzla: restarHoras(FIN_ESPANA, diferencia), espana: FIN_ESPANA },
  }
}

export const JORNADAS: Record<Horario, Jornada> = {
  verano: jornada('Horario de verano', 'España UTC+2 · último domingo de marzo → último domingo de octubre', 6),
  invierno: jornada('Horario de invierno', 'España UTC+1 · último domingo de octubre → último domingo de marzo', 5),
}
