import { shiftIsoDate } from '@/lib/calendarDate'

/* Los commits de «Comparar objetivos» (16/11/2026, por pedido): cuántas llamadas contestadas y
   cuántas demos agendadas se compromete cada comercial por día, contra lo real. Los pone un
   SUPERADMIN (solo del front). Un commit vale desde el día en que se pone hasta el próximo cambio,
   así cambiarlo hoy no recolorea los días de antes, y cuenta solo de lunes a viernes. Una semana o
   un mes suman el commit de cada día hábil del período (que ya corta en hoy). Sin migración: una
   fila de `roadmap_notas`, `crm-commits`, con
   `{ [userId]: { [YYYY-MM-DD]: { contestadas?: n, demos?: n } } }`. */

export const ID_COMMITS = 'crm-commits'

export type CampoDeCommit = 'contestadas' | 'demos'
type CommitDelDia = Partial<Record<CampoDeCommit, number>>
export type Commits = Record<string, Record<string, CommitDelDia>>

const CAMPOS: CampoDeCommit[] = ['contestadas', 'demos']
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const valido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** Se lee a la defensiva: vacío o roto es sin commits, y lo que no sirve se descarta. */
export function leerCommits(texto: string | null | undefined): Commits {
  let v: unknown
  try { v = JSON.parse(texto ?? '') } catch { return {} }
  if (!esObjeto(v)) return {}
  const out: Commits = {}
  for (const [persona, dias] of Object.entries(v)) {
    if (!esObjeto(dias)) continue
    const limpios: Record<string, CommitDelDia> = {}
    for (const [dia, c] of Object.entries(dias)) {
      if (!FECHA.test(dia) || !esObjeto(c)) continue
      const d: CommitDelDia = {}
      for (const k of CAMPOS) if (valido(c[k])) d[k] = Math.round(c[k] as number)
      if (Object.keys(d).length) limpios[dia] = d
    }
    out[persona] = limpios
  }
  return out
}

export const escribirCommits = (c: Commits) => JSON.stringify(c)

/** Pone (o con null saca) el commit de un campo desde `dia`. */
export function conCommit(c: Commits, persona: string, dia: string, campo: CampoDeCommit, valor: number | null): Commits {
  const dias = { ...(c[persona] ?? {}) }
  const d = { ...(dias[dia] ?? {}) }
  if (valor === null) delete d[campo]
  else d[campo] = Math.max(0, Math.round(valor))
  if (Object.keys(d).length) dias[dia] = d
  else delete dias[dia]
  return { ...c, [persona]: dias }
}

/** De lunes a viernes: el commit es de días hábiles. */
export function esDiaHabil(dia: string): boolean {
  const [y, m, d] = dia.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return dow !== 0 && dow !== 6
}

/** El commit de ese día: el último puesto en ese día o antes. El fin de semana no hay. */
export function commitDelDia(c: Commits, persona: string, dia: string, campo: CampoDeCommit): number | undefined {
  if (!esDiaHabil(dia)) return undefined
  const dias = c[persona]
  if (!dias) return undefined
  let mejor: string | undefined
  for (const [k, v] of Object.entries(dias)) {
    if (k <= dia && v[campo] !== undefined && (!mejor || k > mejor)) mejor = k
  }
  return mejor ? dias[mejor][campo] : undefined
}

/** La suma de los commits de los días de [desde, hasta). Sin ningún día con commit, undefined. */
export function commitDelPeriodo(c: Commits, persona: string, desde: string, hasta: string, campo: CampoDeCommit): number | undefined {
  let total: number | undefined
  for (let d = desde; d < hasta; d = shiftIsoDate(d, 1)) {
    const n = commitDelDia(c, persona, d, campo)
    if (n !== undefined) total = (total ?? 0) + n
  }
  return total
}

/** Verde si lo real alcanzó el commit, rojo si no; sin uno de los dos, nada. */
export function tonoDelCommit(real: number | undefined, commit: number | undefined): 'verde' | 'rojo' | undefined {
  if (real === undefined || commit === undefined) return undefined
  return real >= commit ? 'verde' : 'rojo'
}
