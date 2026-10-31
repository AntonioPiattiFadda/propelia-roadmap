// Lo del Roadmap que el MCP tiene que entender igual que el tablero vanilla (legacy/app.js):
// los estados y prioridades con su rótulo, y la explicación de una tarea, que se guarda en tres
// formatos según la marca del principio (CLAUDE.md › Modelo de datos):
//   · texto plano (lo viejo),
//   · HTML con `<!--h-->`,
//   · un árbol de bloques en JSON con `<!--b-->` (la tarea como página).
// Todo puro: se testea sin base (roadmap.test.ts).

export const ESTADOS = [
  { id: 'Pendiente', label: 'Nueva' },
  { id: 'En curso', label: 'En curso' },
  { id: 'Bloqueado', label: 'Bloqueada' },
  { id: 'Revision', label: 'En revisión' },
  { id: 'Hecho', label: 'Terminada' },
] as const

export const ESTADO_IDS = ESTADOS.map((e) => e.id) as [string, ...string[]]

export const PRIORIDADES = [
  { id: 'critica', label: 'Crítica' },
  { id: 'urgente', label: 'Urgente' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'mensual', label: 'Mensual' },
] as const

export const PRIORIDAD_IDS = PRIORIDADES.map((p) => p.id) as [string, ...string[]]

/** 'bisemanal' salió del tablero y se lee como mensual (PRIORIDADES_VIEJAS del vanilla). */
const PRIORIDADES_VIEJAS: Record<string, string> = { bisemanal: 'mensual' }

export function estadoLabel(id: unknown): string | null {
  return ESTADOS.find((e) => e.id === id)?.label ?? (typeof id === 'string' && id ? id : null)
}

export function prioridadLabel(id: unknown): string | null {
  const real = typeof id === 'string' ? (PRIORIDADES_VIEJAS[id] ?? id) : id
  return PRIORIDADES.find((p) => p.id === real)?.label ?? null
}

const MARCA_HTML = '<!--h-->'
const MARCA_BLOQUES = '<!--b-->'

// deno-lint-ignore no-explicit-any
type Bloque = Record<string, any>

export interface Paso {
  id?: string
  titulo?: string
  resp?: string
  estado?: string
}

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** HTML del editor viejo (o el que quedó adentro de un bloque) a texto con saltos de línea. */
export function htmlATexto(html: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, ' [imagen] ')
    .replace(/<(?:br|\/div|\/p|\/li|\/h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTIDADES[e])
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function bloquesDe(expl: string): Bloque[] {
  try {
    const arr = JSON.parse(expl.slice(MARCA_BLOQUES.length))
    return Array.isArray(arr) ? arr : []
  } catch {
    return [{ k: 'text', txt: expl.slice(MARCA_BLOQUES.length) }]
  }
}

/**
 * La explicación como texto, en los tres formatos. Los avisos NO van acá (como `explATexto`
 * del vanilla): son otra cosa y salen por `avisosDeExpl`. Un tilde de la página apunta a un
 * paso de `subtareas` por `sid`: se escribe con su título y si está hecho.
 */
export function explATexto(expl: unknown, pasos: Paso[] = []): string {
  if (typeof expl !== 'string' || !expl) return ''
  if (expl.startsWith(MARCA_HTML)) return htmlATexto(expl.slice(MARCA_HTML.length))
  if (!expl.startsWith(MARCA_BLOQUES)) return expl.trim()

  const lineas: string[] = []
  const recorrer = (lista: Bloque[], nivel: number) => {
    for (const b of lista ?? []) {
      if (!b || b.k === 'hdr') continue
      const sangria = '  '.repeat(nivel)
      const txt = typeof b.txt === 'string' ? htmlATexto(b.txt) : ''
      if (b.k === 'file') lineas.push(`${sangria}[archivo: ${b.f?.n || 'sin nombre'}]`)
      else if (b.k === 'check') {
        const paso = pasos.find((p) => p.id === b.sid)
        if (paso) lineas.push(`${sangria}[${paso.estado === 'Hecho' ? 'x' : ' '}] ${paso.titulo ?? ''}`)
      } else if (b.k === 'h') lineas.push(`${sangria}## ${txt}`)
      else if (b.k === 'page') lineas.push(`${sangria}▤ ${txt}`)
      else if (txt) lineas.push(sangria + txt)
      if (Array.isArray(b.kids)) recorrer(b.kids, nivel + 1)
    }
  }
  recorrer(bloquesDe(expl), 0)
  return lineas.join('\n').trim()
}

export interface Aviso {
  texto: string
  autor: string | null
  ts: string | null
  visto: boolean
  para: string[]
}

/** El cuadro de avisos de la página de la tarea (bloque `hdr`). Sin página, no hay. */
export function avisosDeExpl(expl: unknown): Aviso[] {
  if (typeof expl !== 'string' || !expl.startsWith(MARCA_BLOQUES)) return []
  const hdr = bloquesDe(expl).find((b) => b?.k === 'hdr')
  const avisos = Array.isArray(hdr?.avisos) ? hdr.avisos : []
  return avisos.map((a: Bloque) => ({
    texto: typeof a.texto === 'string' ? a.texto : '',
    autor: typeof a.autor === 'string' ? a.autor : null,
    ts: fechaISO(a.ts),
    visto: !!a.visto,
    para: Array.isArray(a.para) ? a.para.filter((p: unknown) => typeof p === 'string') : [],
  }))
}

/** Un `ts` del vanilla (ISO o milisegundos) a ISO; lo que no es una fecha, null. */
export function fechaISO(ts: unknown): string | null {
  if (typeof ts !== 'string' && typeof ts !== 'number') return null
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** `pend` es la lista de responsables (uuids); las filas viejas pueden traer sólo `resp`. */
export function responsablesDe(pend: unknown): string[] {
  return Array.isArray(pend) ? pend.filter((p): p is string => typeof p === 'string' && !!p) : []
}
