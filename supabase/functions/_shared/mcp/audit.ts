// Auditoría de cada llamada a una tool del MCP (tabla public.mcp_audit_log, migración
// 20261030115614_mcp_oauth_infra). Copiado de propelia-frontend, sin organización: acá no hay.
//
// Único uso de la service role en el MCP, sólo para INSERTAR en esa tabla: las consultas de las
// tools corren con el token del conector. Si la auditoría falla (tabla todavía no creada, red),
// la tool responde igual y el error va al log: no se le corta el servicio a nadie por eso.
//
// Costo: una tool que gaste plata por llamada en un proveedor externo devuelve su salida
// envuelta en `WithCost`; queda en cost_usd (total) y cost_detail (una línea por proveedor).

import { cleanText } from './sanitize.ts'

/** Lo que costó una llamada a un proveedor externo. */
export interface CostLine {
  provider: string
  usd: number
  [detail: string]: unknown
}

/** Salida de una tool que gastó plata: `data` va al cliente, `costs` sólo a la auditoría. */
export class WithCost {
  constructor(readonly data: unknown, readonly costs: CostLine[]) {}
}

export function totalCostUsd(costs: CostLine[]): number {
  return Math.round(costs.reduce((s, c) => s + (Number.isFinite(c.usd) ? c.usd : 0), 0) * 1e6) / 1e6
}

export interface AuditEntry {
  userId: string
  oauthClientId: string | null
  tool: string
  args: Record<string, unknown>
  resultCount: number | null
  ok: boolean
  error?: string | null
  removedKeys?: string[]
  costs?: CostLine[]
}

export type AuditWriter = (entry: AuditEntry) => Promise<void>

const MAX_ARG_STRING = 100

/** Argumentos para guardar: sólo primitivos, textos cortos, sin anidar. */
export function auditArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args ?? {})) {
    if (typeof v === 'string') out[k] = cleanText(v, MAX_ARG_STRING)
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v
  }
  return out
}

/** La fila que se inserta. Aparte para poder testearla sin base. */
export function auditRow(entry: AuditEntry) {
  return {
    user_id: entry.userId,
    oauth_client_id: entry.oauthClientId,
    tool: entry.tool,
    args: auditArgs(entry.args),
    result_count: entry.resultCount,
    ok: entry.ok,
    error: entry.error ? cleanText(entry.error, 300) : null,
    removed_keys: entry.removedKeys && entry.removedKeys.length > 0 ? entry.removedKeys.slice(0, 50) : null,
    cost_usd: entry.costs && entry.costs.length > 0 ? totalCostUsd(entry.costs) : null,
    cost_detail: entry.costs && entry.costs.length > 0 ? entry.costs : null,
  }
}

type GetEnv = (key: string) => string | undefined

// deno-lint-ignore no-explicit-any
export function createSupabaseAuditWriter(getEnv: GetEnv, createClient: (url: string, key: string, opts: any) => any): AuditWriter {
  const url = getEnv('SUPABASE_URL')
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    return (entry) => {
      console.error('mcp audit: falta SUPABASE_SERVICE_ROLE_KEY, no se audita', entry.tool)
      return Promise.resolve()
    }
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return async (entry) => {
    try {
      const { error } = await admin.from('mcp_audit_log').insert(auditRow(entry))
      if (error) console.error('mcp audit: no se pudo guardar', entry.tool, error.message)
    } catch (err) {
      console.error('mcp audit: no se pudo guardar', entry.tool, err)
    }
  }
}
