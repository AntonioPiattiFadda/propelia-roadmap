// Última barrera antes de mandarle algo a Claude / ChatGPT. Las tools ya leen de vistas
// `mcp_*` con sólo columnas permitidas y arman la salida campo por campo; esto es por si una
// de esas capas falla (alguien agrega una columna a una vista, se mapea `...row`).
//
// 1. Claves sensibles: se SACAN de la salida, a cualquier profundidad, y se registran (log y
//    mcp_audit_log). Si esto llega a sacar algo, hay un bug en la tool o en la vista.
// 2. Textos: los cargan personas (título y descripción del anuncio). Se les sacan caracteres
//    de control y saltos de línea raros, y se cortan largos. No evita el prompt injection, lo
//    achica.
//
// `description` (el texto del anuncio, ya publicado en los portales) y `floor` (la planta del
// inmueble) se entregan a propósito: no están en la lista.

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  // dirección exacta
  /^street(_number)?$/i, /^door$/i, /postal_code/i, /^premise$/i, /^subpremise$/i,
  /^lat(itude)?$/i, /^lng$/i, /^lon(gitude)?$/i, /google_place_id/i, /^address_id$/i,
  /cadastral/i, /catastr/i,
  // datos internos y de clientes
  /internal_notes/i, /^notes?$/i, /drive_folder/i, /seller_lead/i, /contact_data/i,
  /^acquisition_/i, /^valuation_(?!id$)/i,
  /e?mail/i, /phone/i, /^tel(efono)?$/i, /^dni$/i, /^nie$/i, /^nif$/i, /document_number/i,
  /first_name/i, /last_name/i, /full_name/i, /^client(_id)?$/i,
  // credenciales
  /password/i, /secret/i, /token/i, /credential/i, /api_?key/i,
]

const MAX_STRING = 4000
const MAX_DEPTH = 8

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key))
}

/** Saca caracteres de control (deja los saltos de línea simples) y corta textos largos. */
export function cleanText(value: string, max = MAX_STRING): string {
  const flat = value
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export interface Sanitized<T> {
  value: T
  /** Rutas de las claves que se sacaron. Vacío = todo bien. */
  removed: string[]
}

/**
 * `allowKeys`: claves que la tool entrega a propósito (McpToolDef.publicKeys, sólo Catastro).
 * Coincidencia exacta del nombre: cualquier otra clave sensible se sigue sacando.
 */
export function sanitizeOutput<T>(input: T, opts: { allowKeys?: readonly string[] } = {}): Sanitized<T> {
  const allow = new Set(opts.allowKeys ?? [])
  const removed: string[] = []
  const walk = (v: unknown, path: string, depth: number): unknown => {
    if (typeof v === 'string') return cleanText(v)
    if (v === null || typeof v !== 'object') return v
    if (depth > MAX_DEPTH) {
      removed.push(`${path} (demasiado profundo)`)
      return null
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`, depth + 1))
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const keyPath = path ? `${path}.${k}` : k
      if (isSensitiveKey(k) && !allow.has(k)) {
        removed.push(keyPath)
        continue
      }
      out[k] = walk(x, keyPath, depth + 1)
    }
    return out
  }
  return { value: walk(input, '', 0) as T, removed }
}
