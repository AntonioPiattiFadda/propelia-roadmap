import { fmtDayMonth, fmtDueLabel, shiftIsoDate, toIsoDate } from '@/lib/calendarDate'
import type { CrmMeeting, LeadDetalle, Usuario } from '../types'
import { nombreDe } from './permisos'
import { esTituloDeDemoDeFabrica } from './reuniones'

/* La actividad del lead en una sola lista: lo que se escribió (comentarios MANUAL), lo que dejó
   el sistema (comentarios SYSTEM) y lo que registran la base y los triggers (gestiones, cambios
   de etapa y de responsable). Una lista y no cuatro: la pregunta al abrir un lead es «qué pasó
   con esto», y la respuesta es en orden. */
export type ItemActividad = {
  id: string
  tipo: 'comentario' | 'llamada' | 'sistema' | 'gestion' | 'pospuesto' | 'asignacion' | 'reunion'
  /** Cuándo pasó (no cuándo vence): lo que ordena la lista. */
  fecha: string
  texto: string
  autorId: string | null
  /** Con quién de la inmobiliaria (solo notas y llamadas; vacío = no se dijo). */
  con?: string[]
  /** Solo llamadas: qué pasó y si fue con un decisor. */
  resultado?: ResultadoDeLlamada
  decisor?: boolean
  /** Solo llamadas: a qué teléfono se llamó (ver `MetaDeActividad`). */
  telefono?: { numero: string; etiqueta: string }
  /** Solo contactos fallidos: qué intento seguido es (ver `INTENTOS_DE_CONTACTO`). */
  intento?: number
  /** Solo demos registradas: el decisor que se apuntó al agendarla. */
  decisorApuntado?: string
  /** Solo demos con su reunión viva: cuál es y en qué estado está. Cancelar la demo desde la
   *  actividad (23/10/2026, por pedido) se ofrece mientras esté `scheduled`. */
  reunion?: { id: string; estado: CrmMeeting['status'] }
}

/** Los contactos fallidos seguidos se cuentan sobre este número: «2/10» (17/10/2026, por pedido).
 *  No frena nada: el once dice «11/10». */
export const INTENTOS_DE_CONTACTO = 10

/* Qué fue una actividad escrita a mano —nota o llamada— y con quién, colgado del comentario en
   `long_description`: la columna existe y ninguna pantalla la usaba, y `comment_type` solo admite
   MANUAL y SYSTEM, así que una llamada no tenía dónde decir que era una llamada sin migración.
   Misma jugada que el tablero con `modulo`, `hoy` y `tipo`. Por eso se lee ESTRICTO: por la marca
   del principio y la forma del JSON, nunca «lo que haya»; si algún día otro escribe ahí texto
   largo de verdad, no tiene que leerse como una llamada. Se guardan los nombres y no el casillero:
   el teléfono alternativo de hoy puede ser otra persona mañana, y la llamada fue con quien fue. */
const MARCA_ACTIVIDAD = '<!--act-->'
/** Qué pasó en una llamada. Opcional: las llamadas anteriores al 10/10/2026 no lo dicen. */
export type ResultadoDeLlamada = 'contestada' | 'no_respondida'
export type MetaDeActividad = {
  /** `demo` (22/10/2026): el registro que se deja al agendar una demo desde la Agenda. */
  tipo: 'nota' | 'llamada' | 'demo'
  con: string[]
  resultado?: ResultadoDeLlamada
  /** Si quien atendió decide. Solo tiene sentido en una llamada contestada. */
  decisor?: boolean
  /** Solo llamadas: a qué número se llamó y cómo se llamaba ese número en el perfil («Oficina»,
   *  «Laura»). Va aparte de `con` porque el número marcado y quien atiende no siempre coinciden
   *  (16/10/2026, por pedido). Las llamadas anteriores no lo dicen. */
  telefono?: { numero: string; etiqueta: string }
  /** Solo demos: el decisor que dio el doorkeeper, si se apuntó (no tiene por qué asistir). */
  decisorApuntado?: string
  /** Solo demos: el id de la reunión en `crm_meetings`. La actividad y la reunión se pintan como un
   *  solo renglón, y el día y la hora salen de la reunión: si la mueven, el registro no miente. */
  reunion?: string
}

/** El texto de la demo registrada sin nada escrito: `description` no puede ir vacío. */
export const TEXTO_DE_DEMO = 'Demo agendada.'

/** Lo que queda escrito en la llamada si no se escribió nada: el resultado ya es el dato. */
export const TEXTO_DE_LLAMADA: Record<ResultadoDeLlamada, string> = { contestada: 'Llamada contestada.', no_respondida: 'No respondió.' }

/** El texto al editar una actividad escrita a mano (20/10/2026, por pedido). Vaciada, la llamada
 *  vuelve al texto de fábrica de su resultado, como al registrarla; la nota (y la llamada vieja,
 *  que no dice su resultado) no tiene con qué llenarse: `null` es «no se puede guardar». */
export function textoEditado(i: Pick<ItemActividad, 'tipo' | 'resultado'>, texto: string): string | null {
  const limpio = texto.trim()
  if (limpio) return limpio
  return i.tipo === 'llamada' && i.resultado ? TEXTO_DE_LLAMADA[i.resultado] : null
}

/** Lo que va a `long_description`. Una nota sin nadie no guarda nada: es un comentario de siempre. */
export function armarMetaDeActividad(meta: MetaDeActividad): string | null {
  if (meta.tipo === 'nota' && meta.con.length === 0) return null
  return MARCA_ACTIVIDAD + JSON.stringify(meta)
}

function esTelefonoGuardado(t: unknown): t is { numero: string; etiqueta: string } {
  if (typeof t !== 'object' || t === null) return false
  const { numero, etiqueta } = t as Record<string, unknown>
  return typeof numero === 'string' && typeof etiqueta === 'string'
}

export function leerMetaDeActividad(guardado: string | null): MetaDeActividad | null {
  if (!guardado?.startsWith(MARCA_ACTIVIDAD)) return null
  try {
    const m: unknown = JSON.parse(guardado.slice(MARCA_ACTIVIDAD.length))
    if (typeof m !== 'object' || m === null) return null
    const { tipo, con, resultado, decisor, telefono, decisorApuntado, reunion } = m as Record<string, unknown>
    if (tipo !== 'nota' && tipo !== 'llamada' && tipo !== 'demo') return null
    if (!Array.isArray(con) || !con.every(c => typeof c === 'string')) return null
    if (resultado !== undefined && resultado !== 'contestada' && resultado !== 'no_respondida') return null
    if (decisor !== undefined && typeof decisor !== 'boolean') return null
    if (telefono !== undefined && !esTelefonoGuardado(telefono)) return null
    if (decisorApuntado !== undefined && typeof decisorApuntado !== 'string') return null
    if (reunion !== undefined && typeof reunion !== 'string') return null
    return {
      tipo, con,
      ...(resultado !== undefined && { resultado }),
      ...(decisor !== undefined && { decisor }),
      ...(telefono !== undefined && { telefono: { numero: telefono.numero, etiqueta: telefono.etiqueta } }),
      ...(decisorApuntado !== undefined && { decisorApuntado }),
      ...(reunion !== undefined && { reunion }),
    }
  } catch { return null }
}

export type ResumenDeLlamadas = { contestadas: number; decisores: number; noRespondidas: number }

/** El contador del día. Se le pasa el `long_description` de cada comentario: lo que no es una
 *  llamada con resultado (notas, comentarios viejos, llamadas de antes de que existiera) no
 *  cuenta. Las de decisor son también contestadas: es un subconjunto, no una tercera bolsa. */
export function resumenDeLlamadas(guardados: readonly (string | null)[]): ResumenDeLlamadas {
  const r: ResumenDeLlamadas = { contestadas: 0, decisores: 0, noRespondidas: 0 }
  for (const g of guardados) for (const k of bolsasDeLlamada(g)) r[k]++
  return r
}

/** En qué números del contador cae una actividad guardada: ninguno, uno o dos (con decisor
 *  también es contestada). Una sola regla para contar y para filtrar (`objetivosDe`). */
export function bolsasDeLlamada(guardado: string | null): (keyof ResumenDeLlamadas)[] {
  const m = leerMetaDeActividad(guardado)
  if (m?.tipo !== 'llamada') return []
  if (m.resultado === 'no_respondida') return ['noRespondidas']
  if (m.resultado === 'contestada') return m.decisor ? ['contestadas', 'decisores'] : ['contestadas']
  return []
}

/** Si en esta inmobiliaria ya se habló con quien decide (16/10/2026, por pedido): la primera
 *  llamada contestada con el decisor, sin importar en qué etapa esté el lead. Sale de las llamadas
 *  registradas y no de una columna: el dato ya estaba en cada llamada y así no hace falta
 *  migración. Borrar esa llamada (se cargó por error) lo desmarca, que es lo correcto. */
export function decisorContactado(
  comments: readonly Pick<LeadDetalle['comments'][number], 'created_at' | 'long_description' | 'deleted_at'>[],
): { fecha: string; con: string[] } | null {
  let primera: { fecha: string; con: string[] } | null = null
  for (const c of comments) {
    if (c.deleted_at) continue
    const m = leerMetaDeActividad(c.long_description)
    if (m?.tipo !== 'llamada' || m.resultado !== 'contestada' || !m.decisor) continue
    if (!primera || c.created_at < primera.fecha) primera = { fecha: c.created_at, con: m.con }
  }
  return primera
}

/** El último número marcado y la última gente con quien se habló, cada uno por su lado (17/10/2026,
 *  por pedido): «Hablaste con» y «Teléfono contacto» los ofrecen primero. Solo ordenan, no eligen: los dos
 *  campos siguen arrancando vacíos, para que no se confirmen sin mirarlos. El número sale también
 *  de un contacto fallido (se marcó igual); la gente, de cualquier actividad que diga con quién. */
export function ultimoContacto(
  comments: readonly Pick<LeadDetalle['comments'][number], 'created_at' | 'long_description' | 'deleted_at'>[],
): { telefono: string | null; con: string[] } {
  let telefono: { fecha: string; numero: string } | null = null
  let con: { fecha: string; nombres: string[] } | null = null
  for (const c of comments) {
    if (c.deleted_at) continue
    const m = leerMetaDeActividad(c.long_description)
    if (!m) continue
    if (m.telefono && (!telefono || c.created_at > telefono.fecha)) telefono = { fecha: c.created_at, numero: m.telefono.numero }
    if (m.con.length > 0 && (!con || c.created_at > con.fecha)) con = { fecha: c.created_at, nombres: m.con }
  }
  return { telefono: telefono?.numero ?? null, con: con?.nombres ?? [] }
}

/** Lo último usado adelante y el resto en el orden que traía. */
export function primeroLosUltimos<T>(xs: readonly T[], esUltimo: (x: T) => boolean): T[] {
  return [...xs.filter(esUltimo), ...xs.filter(x => !esUltimo(x))]
}

/* El consejo de Claude ya no es actividad (17/10/2026, por pedido): lo que se muestra de él —
   personas y teléfonos— vive en la pestaña de la inmobiliaria (`investigacionDeClaude`). */
export function lineaDeTiempo(detalle: LeadDetalle, usuarios: Usuario[]): ItemActividad[] {
  const reuniones = new Map(detalle.meetings.filter(m => m.deleted_at == null).map(m => [m.id, m]))
  /* La demo agendada desde la Agenda deja un registro (22/10/2026, por pedido) con quién asiste,
     el decisor y lo escrito. Registro y reunión son UN renglón: el del registro, con el día y la
     hora de la reunión de hoy. La reunión que tiene registro no se pinta aparte. */
  const conRegistro = new Set<string>()
  const items: ItemActividad[] = [
    ...detalle.comments.map(c => {
      if (c.comment_type === 'SYSTEM') return { id: c.id, tipo: 'sistema' as const, fecha: c.created_at, texto: c.description, autorId: c.created_by }
      const meta = leerMetaDeActividad(c.long_description)
      if (meta?.tipo === 'demo') {
        const reunion = meta.reunion ? reuniones.get(meta.reunion) : undefined
        if (reunion) conRegistro.add(reunion.id)
        return {
          id: c.id, tipo: 'reunion' as const, fecha: c.created_at, autorId: c.created_by, con: meta.con,
          decisorApuntado: meta.decisorApuntado,
          ...(reunion && { reunion: { id: reunion.id, estado: reunion.status } }),
          texto: [
            reunion?.status === 'cancelled' && `Cancelada${reunion.cancel_reason ? ` · ${reunion.cancel_reason}` : ''}`,
            reunion && `Para el ${fmtDayMonth(toIsoDate(new Date(reunion.starts_at)))} a las ${horaDe(reunion.starts_at)}`,
            meta.decisorApuntado && `Decisor: ${meta.decisorApuntado}`,
            c.description !== TEXTO_DE_DEMO && c.description,
          ].filter(Boolean).join('\n'),
        }
      }
      return {
        id: c.id, tipo: meta?.tipo === 'llamada' ? 'llamada' as const : 'comentario' as const,
        fecha: c.created_at, texto: c.description, autorId: c.created_by, con: meta?.con ?? [],
        resultado: meta?.resultado, decisor: meta?.decisor, telefono: meta?.telefono,
      }
    }),
    ...detalle.events.map(e => ({
      id: e.id,
      tipo: e.action === 'POSTPONED' ? 'pospuesto' as const : 'gestion' as const,
      // created_at: un pospuesto a la semana que viene se hizo HOY, y ahí va en la lista.
      fecha: e.created_at,
      // toIsoDate usa el día LOCAL: un timestamptz de las 01:00 UTC es el día anterior en Buenos Aires.
      texto: (e.action === 'POSTPONED' ? `Gestión pospuesta hasta ${fmtDayMonth(toIsoDate(new Date(e.effective_at)))}` : 'Gestión registrada')
        + (e.note ? ` · ${e.note}` : ''),
      autorId: e.created_by,
    })),
    /* Ni los cambios de estado ni las tareas agendadas son actividad (16/10/2026, por pedido):
       llenaban la lista de «Estado: A → B» y «Se agendó la tarea…». La base los sigue guardando
       (`crm_stage_history`, `crm_tasks`); el estado se ve en el perfil y las tareas en su panel. */
    ...detalle.assignmentHistory.map(h => ({
      id: h.id, tipo: 'asignacion' as const, fecha: h.changed_at,
      texto: `Responsable: ${nombreDe(usuarios, h.from_user_id)} → ${nombreDe(usuarios, h.to_user_id)}`,
      autorId: h.changed_by,
    })),
    /* Una reunión entra cuando se agendó (created_at), que es lo que pasó; para cuándo es va en
       el texto. Se nombra «demo» porque es lo único que agenda el compositor, y el título «Demo»
       que le pone de fábrica no se repite: diría lo mismo dos veces. */
    ...[...reuniones.values()].filter(m => !conRegistro.has(m.id)).map(m => ({
      id: m.id, tipo: 'reunion' as const, fecha: m.created_at,
      reunion: { id: m.id, estado: m.status },
      texto: `Se agendó una demo para el ${fmtDayMonth(toIsoDate(new Date(m.starts_at)))} a las ${horaDe(m.starts_at)}`
        + (m.title && !esTituloDeDemoDeFabrica(m.title) ? ` · ${m.title}` : '')
        + (m.status === 'cancelled' ? ' · Cancelada' : ''),
      autorId: m.created_by,
    })),
  ]
  items.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
  /* Cada contacto fallido dice qué intento seguido es. La racha la corta una llamada contestada y
     nada más: una nota o una demo en el medio no significa que alguien haya atendido. */
  let racha = 0
  for (const i of items) {
    if (i.tipo !== 'llamada') continue
    if (i.resultado === 'no_respondida') i.intento = ++racha
    else if (i.resultado === 'contestada') racha = 0
  }
  return items
}

/** HH:mm del instante en la zona de quien mira. */
export function horaDe(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const DIAS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export type DiaDeActividad = { dia: string; rotulo: string; items: ItemActividad[] }

/**
 * La línea de tiempo partida por día LOCAL, en el orden en que llegan los items (ya vienen
 * ordenados). Hoy y ayer se nombran; el resto lleva el día de la semana, que es lo que se
 * recuerda de una llamada («fue el jueves»). El año solo si no es el de hoy.
 */
export function agruparPorDia(items: ItemActividad[], hoy: string): DiaDeActividad[] {
  const grupos = new Map<string, DiaDeActividad>()
  for (const item of items) {
    const fecha = new Date(item.fecha)
    const dia = toIsoDate(fecha)
    let grupo = grupos.get(dia)
    if (!grupo) {
      const rotulo = dia === hoy ? 'Hoy'
        : dia === shiftIsoDate(hoy, -1) ? 'Ayer'
          : `${DIAS_ES[fecha.getDay()]} ${fmtDueLabel(dia, hoy)}`
      grupo = { dia, rotulo, items: [] }
      grupos.set(dia, grupo)
    }
    grupo.items.push(item)
  }
  return [...grupos.values()]
}
