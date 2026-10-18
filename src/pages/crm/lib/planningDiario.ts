/* El planning diario del SDR: dos jornadas fijas, una por horario de España. El inicio en
   Venezuela es siempre 04:30; lo que se mueve es la hora española (diferencia 6 h en verano,
   5 h en invierno), y con ella qué franja cae en la mañana española. */

export type Horario = 'verano' | 'invierno'

export type TipoDeBloque = 'arranque' | 'volumen' | 'tareas' | 'pausa' | 'capacitacion' | 'seguimiento' | 'revision'

export interface Bloque {
  vzla: string
  espana: string
  tipo: TipoDeBloque
  titulo: string
  texto: string
}

export interface Jornada {
  titulo: string
  bajada: string
  metas: string[]
  bloques: Bloque[]
}

/** Qué horario rige en España en ese instante. Lo decide el huso de Europe/Madrid y no una
 *  fecha escrita a mano: el cambio cae el último domingo de marzo y de octubre, cada año. */
export function horarioDeEspana(fecha: Date = new Date()): Horario {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' })
    .formatToParts(fecha)
    .find(p => p.type === 'timeZoneName')?.value
  return offset === 'GMT+2' ? 'verano' : 'invierno'
}

const SIN_CONTACTO = 'Filtro "Sin contacto" → llamar en orden, sin saltarse ninguno'
const TAREAS_MEDIODIA = 'Leads que ya pasaron de "Sin contacto": localizar al decisor, rellamadas pactadas, WhatsApp, acciones en el CRM · antes del cierre de mediodía'
const CAPACITACION = 'Aircall → 2–3 llamadas transcritas → analizar con la IA → 1 mejora para aplicar'
const SEGUIMIENTO = 'Agencias cerradas → WhatsApps y emails de seguimiento · confirmar demos · tareas del CRM sin llamada · preparar fichas'
const REVISION = 'Leads en estados posteriores a "Sin contacto" sin tarea → analizar y agendar la próxima acción con fecha'

export const JORNADAS: Record<Horario, Jornada> = {
  verano: {
    titulo: 'Horario de verano',
    bajada: 'España UTC+2 · último domingo de marzo → último domingo de octubre',
    metas: ['~45 intentos', '~16 contactados'],
    bloques: [
      { vzla: '04:30', espana: '10:30', tipo: 'arranque', titulo: 'Arranque · 15 min', texto: 'Tareas del día y tareas con hora fija' },
      { vzla: '04:45', espana: '10:45', tipo: 'volumen', titulo: 'Volumen 1 · 2 h 30', texto: `${SIN_CONTACTO} · ~30 intentos` },
      { vzla: '07:15', espana: '13:15', tipo: 'tareas', titulo: 'Tareas programadas · 45 min', texto: TAREAS_MEDIODIA },
      { vzla: '08:00', espana: '14:00', tipo: 'pausa', titulo: 'Pausa · 30 min', texto: 'En España, hora de comer' },
      { vzla: '08:30', espana: '14:30', tipo: 'capacitacion', titulo: 'Capacitación y análisis · 30 min', texto: CAPACITACION },
      { vzla: '09:00', espana: '15:00', tipo: 'seguimiento', titulo: 'Seguimiento escrito y preparación · 90 min', texto: SEGUIMIENTO },
      { vzla: '10:30', espana: '16:30', tipo: 'tareas', titulo: 'Tareas programadas · 45 min', texto: 'Reabren las agencias · las de hora pactada, a su hora exacta' },
      { vzla: '11:15', espana: '17:15', tipo: 'volumen', titulo: 'Volumen 2 · 1 h 15', texto: `${SIN_CONTACTO} · seguir donde lo dejaste · ~15 intentos` },
      { vzla: '12:30', espana: '18:30', tipo: 'revision', titulo: 'Revisión de tareas · 30 min → fin 13:00 (19:00 ES)', texto: REVISION },
    ],
  },
  invierno: {
    titulo: 'Horario de invierno',
    bajada: 'España UTC+1 · último domingo de octubre → último domingo de marzo',
    metas: ['~42 intentos', '~15 contactados'],
    bloques: [
      { vzla: '04:30', espana: '09:30', tipo: 'arranque', titulo: 'Arranque · 15 min', texto: 'Tareas del día y tareas con hora fija' },
      { vzla: '04:45', espana: '09:45', tipo: 'seguimiento', titulo: 'Preparación · 30 min', texto: 'Fichas del volumen (dueño, pisos, zona, CRM) · confirmar las demos del día' },
      { vzla: '05:15', espana: '10:15', tipo: 'volumen', titulo: 'Volumen 1 · 3 h', texto: `${SIN_CONTACTO} · ~36 intentos · mañana española, la mejor franja` },
      { vzla: '08:15', espana: '13:15', tipo: 'tareas', titulo: 'Tareas programadas · 45 min', texto: TAREAS_MEDIODIA },
      { vzla: '09:00', espana: '14:00', tipo: 'pausa', titulo: 'Pausa · 30 min', texto: 'En España, hora de comer' },
      { vzla: '09:30', espana: '14:30', tipo: 'capacitacion', titulo: 'Capacitación y análisis · 30 min', texto: CAPACITACION },
      { vzla: '10:00', espana: '15:00', tipo: 'seguimiento', titulo: 'Seguimiento escrito y preparación · 90 min', texto: SEGUIMIENTO },
      { vzla: '11:30', espana: '16:30', tipo: 'tareas', titulo: 'Tareas programadas · 30 min', texto: 'Reabren las agencias · las de hora pactada, a su hora exacta' },
      { vzla: '12:00', espana: '17:00', tipo: 'volumen', titulo: 'Volumen 2 · 30 min', texto: `${SIN_CONTACTO} · ~6 intentos` },
      { vzla: '12:30', espana: '17:30', tipo: 'revision', titulo: 'Revisión de tareas · 30 min → fin 13:00 (18:00 ES)', texto: REVISION },
    ],
  },
}
