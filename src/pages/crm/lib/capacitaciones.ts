import { nombreLimpio } from './playbook'

/* Capacitaciones del CRM (5/11/2026, por pedido): módulos con una guía escrita y sus videos, como
   la Capacitación de propelia-frontend pero sin tablas. Todo vive en `roadmap_notas`: la fila
   `crm-capacitaciones` guarda el JSON entero (`leerCapacitaciones`) y cada persona tiene su fila
   `crm-capacitaciones-vistos-<id>` con lo que ya vio (`leerVistos`). Los videos subidos van al
   bucket `roadmap-adjuntos` bajo `capacitaciones/`. Sin migración. */

export const ID_CAPACITACIONES = 'crm-capacitaciones'
export const CARPETA_CAPACITACIONES = 'capacitaciones'

export type ArchivoDeVideo = { path: string; b: string; n: string; size: number }

export type VideoCapacitacion = {
  id: string
  titulo: string
  descripcion: string
  /** Texto libre («4:30», «12 min»): no se calcula, lo escribe quien carga el video. */
  duracion: string
  archivo?: ArchivoDeVideo
  url?: string
}

export type ModuloCapacitacion = { id: string; titulo: string; guia: string; videos: VideoCapacitacion[] }
export type Capacitaciones = { modulos: ModuloCapacitacion[] }
/** id del video → cuándo se marcó visto (ISO). Clave presente = visto. */
export type Vistos = Record<string, string>

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const texto = (x: unknown) => (typeof x === 'string' ? x : '')
const idValido = (x: unknown): x is string => typeof x === 'string' && x.length > 0

function parsear(crudo: string): unknown {
  try { return JSON.parse(crudo) } catch { return null }
}

function leerArchivo(x: unknown): ArchivoDeVideo | undefined {
  if (!esObjeto(x) || !idValido(x.path)) return undefined
  return { path: x.path, b: texto(x.b), n: texto(x.n), size: typeof x.size === 'number' ? x.size : 0 }
}

function leerVideo(x: unknown): VideoCapacitacion | null {
  if (!esObjeto(x) || !idValido(x.id)) return null
  const v: VideoCapacitacion = { id: x.id, titulo: texto(x.titulo), descripcion: texto(x.descripcion), duracion: texto(x.duracion) }
  const archivo = leerArchivo(x.archivo)
  if (archivo) v.archivo = archivo
  const url = texto(x.url).trim()
  if (url) v.url = url
  return v
}

function leerModulo(x: unknown): ModuloCapacitacion | null {
  if (!esObjeto(x) || !idValido(x.id)) return null
  const videos = Array.isArray(x.videos) ? x.videos.map(leerVideo).filter((v): v is VideoCapacitacion => v !== null) : []
  return { id: x.id, titulo: texto(x.titulo), guia: texto(x.guia), videos }
}

/** Vacío, roto o con otra forma es «sin módulos»: nunca tira. */
export function leerCapacitaciones(crudo: string): Capacitaciones {
  const datos = parsear(crudo)
  if (!esObjeto(datos) || !Array.isArray(datos.modulos)) return { modulos: [] }
  return { modulos: datos.modulos.map(leerModulo).filter((m): m is ModuloCapacitacion => m !== null) }
}

export function escribirCapacitaciones(c: Capacitaciones): string {
  return JSON.stringify(c)
}

export const idDeVistos = (userId: string) => `${ID_CAPACITACIONES}-vistos-${userId}`

export function leerVistos(crudo: string): Vistos {
  const datos = parsear(crudo)
  if (!esObjeto(datos)) return {}
  const vistos: Vistos = {}
  for (const [id, cuando] of Object.entries(datos)) if (typeof cuando === 'string') vistos[id] = cuando
  return vistos
}

export const escribirVistos = (v: Vistos) => JSON.stringify(v)

export function alternarVisto(vistos: Vistos, videoId: string, ahora: Date): Vistos {
  const nuevo = { ...vistos }
  if (videoId in nuevo) delete nuevo[videoId]
  else nuevo[videoId] = ahora.toISOString()
  return nuevo
}

export const todosLosVideos = (modulos: ModuloCapacitacion[]) => modulos.flatMap(m => m.videos)

export function contarVistos(videos: VideoCapacitacion[], vistos: Vistos) {
  return { vistos: videos.filter(v => v.id in vistos).length, total: videos.length }
}

export const tieneFuente = (v: VideoCapacitacion) => !!v.archivo || !!v.url

/** Por dónde seguir: el primero sin ver que tenga algo para mirar, en el orden de los módulos. */
export function siguienteSinVer(modulos: ModuloCapacitacion[], vistos: Vistos) {
  for (const modulo of modulos) {
    const video = modulo.videos.find(v => tieneFuente(v) && !(v.id in vistos))
    if (video) return { modulo, video }
  }
  return null
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Con búsqueda, cada módulo queda solo con lo que coincide y los que no tienen nada se van. */
export function filtrarPorBusqueda(modulos: ModuloCapacitacion[], busqueda: string): ModuloCapacitacion[] {
  const q = normalizar(busqueda.trim())
  if (!q) return modulos
  const coincide = (v: VideoCapacitacion) => normalizar(v.titulo).includes(q) || normalizar(v.descripcion).includes(q)
  return modulos
    .map(m => ({ ...m, videos: m.videos.filter(coincide) }))
    .filter(m => m.videos.length > 0)
}

/** «1.2»: módulo y video contando desde 1. Vacío si no está. */
export function codigoDeVideo(modulos: ModuloCapacitacion[], videoId: string): string {
  for (const [i, m] of modulos.entries()) {
    const j = m.videos.findIndex(v => v.id === videoId)
    if (j >= 0) return `${i + 1}.${j + 1}`
  }
  return ''
}

/* ---- Edición (solo SUPERADMIN en pantalla). Todo devuelve un objeto nuevo. ---- */

function mover<T extends { id: string }>(lista: T[], id: string, dir: -1 | 1): T[] | null {
  const i = lista.findIndex(x => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= lista.length) return null
  const nueva = [...lista]
  ;[nueva[i], nueva[j]] = [nueva[j], nueva[i]]
  return nueva
}

export function moverModulo(c: Capacitaciones, moduloId: string, dir: -1 | 1): Capacitaciones {
  const modulos = mover(c.modulos, moduloId, dir)
  return modulos ? { modulos } : c
}

export function moverVideo(c: Capacitaciones, moduloId: string, videoId: string, dir: -1 | 1): Capacitaciones {
  const modulo = c.modulos.find(m => m.id === moduloId)
  const videos = modulo && mover(modulo.videos, videoId, dir)
  if (!videos) return c
  return { modulos: c.modulos.map(m => (m.id === moduloId ? { ...m, videos } : m)) }
}

export const nuevoModulo = (id: string, titulo: string): ModuloCapacitacion => ({ id, titulo, guia: '', videos: [] })

export function actualizarModulo(c: Capacitaciones, moduloId: string, cambios: Partial<Pick<ModuloCapacitacion, 'titulo' | 'guia'>>): Capacitaciones {
  return { modulos: c.modulos.map(m => (m.id === moduloId ? { ...m, ...cambios } : m)) }
}

/** Devuelve también los archivos de sus videos, para borrarlos del bucket. */
export function borrarModulo(c: Capacitaciones, moduloId: string) {
  const modulo = c.modulos.find(m => m.id === moduloId)
  return {
    capacitaciones: { modulos: c.modulos.filter(m => m.id !== moduloId) },
    archivos: (modulo?.videos ?? []).flatMap(v => (v.archivo ? [v.archivo] : [])),
  }
}

/** Reemplaza el video con el mismo id o lo agrega al final del módulo. */
export function guardarVideo(c: Capacitaciones, moduloId: string, video: VideoCapacitacion): Capacitaciones {
  return {
    modulos: c.modulos.map(m => {
      if (m.id !== moduloId) return m
      const existe = m.videos.some(v => v.id === video.id)
      return { ...m, videos: existe ? m.videos.map(v => (v.id === video.id ? video : v)) : [...m.videos, video] }
    }),
  }
}

export function borrarVideo(c: Capacitaciones, videoId: string) {
  const video = todosLosVideos(c.modulos).find(v => v.id === videoId)
  return {
    capacitaciones: { modulos: c.modulos.map(m => ({ ...m, videos: m.videos.filter(v => v.id !== videoId) })) },
    archivo: video?.archivo ?? null,
  }
}

/** Supabase valida las claves con un regex ASCII (ver `nombreLimpio`). */
export const claveDeVideo = (nombre: string, uuid: string) => `${CARPETA_CAPACITACIONES}/${uuid}-${nombreLimpio(nombre)}`

/* ---- De dónde sale el video ---- */

export type FuenteDeVideo =
  | { tipo: 'archivo'; archivo: ArchivoDeVideo }
  | { tipo: 'directo'; url: string }
  | { tipo: 'embed'; url: string }
  | { tipo: 'enlace'; url: string }
  | { tipo: 'ninguna' }

function embebible(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return id ? `https://www.youtube.com/embed/${id}` : null
  }
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
    return id ? `https://www.youtube.com/embed/${id}` : null
  }
  if (host === 'loom.com') {
    const id = u.pathname.match(/^\/(?:share|embed)\/([^/]+)/)?.[1]
    return id ? `https://www.loom.com/embed/${id}` : null
  }
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/^\/file\/d\/([^/]+)/)?.[1]
    return id ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  return null
}

/** El archivo subido gana sobre la URL. Una URL que no es http(s) no se dibuja ni se abre. */
export function fuenteDeVideo(v: VideoCapacitacion): FuenteDeVideo {
  if (v.archivo) return { tipo: 'archivo', archivo: v.archivo }
  if (!v.url) return { tipo: 'ninguna' }
  let u: URL
  try { u = new URL(v.url) } catch { return { tipo: 'ninguna' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { tipo: 'ninguna' }
  if (/\.(mp4|webm|m4v|mov|ogg|ogv)$/i.test(u.pathname)) return { tipo: 'directo', url: v.url }
  const embed = embebible(u)
  return embed ? { tipo: 'embed', url: embed } : { tipo: 'enlace', url: v.url }
}
