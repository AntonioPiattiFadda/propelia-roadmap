// Acceso de las tools del MCP a la base: SÓLO las vistas `mcp_*` y las RPC de relations.ts,
// siempre con el cliente armado con el token del conector. Los tipos no dejan nombrar otra
// cosa, y la base igual le devolvería 403 al conector (migración
// 20261030115614_mcp_oauth_infra).
//
// Es una interfaz chica a propósito: las tools se testean con una base de mentira
// (mcp/index.test.ts) y la traducción a PostgREST vive sólo acá.

import type { McpRelation, McpRpc } from './relations.ts'

export type Filter =
  | { op: 'eq'; column: string; value: string | number | boolean }
  | { op: 'in'; column: string; values: Array<string | number> }
  | { op: 'gte' | 'lt' | 'lte'; column: string; value: string | number }
  /** jsonb que contiene ese valor (ej. `pend` de una tarea del roadmap contiene un id). */
  | { op: 'contains'; column: string; value: unknown }
  | { op: 'ilike'; column: string; value: string }
  | { op: 'is_null' | 'not_null'; column: string }

export interface ViewQuery {
  view: McpRelation
  /** Columnas explícitas, nunca `*`: si una vista suma una columna, no sale sola. */
  columns: readonly string[]
  filters?: Filter[]
  order?: Array<{ column: string; ascending: boolean }>
  /** [desde, hasta] inclusive, como `.range()`. */
  range?: [number, number]
  count?: boolean
}

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>

export interface McpDb {
  select(query: ViewQuery): Promise<{ rows: Row[]; total: number | null }>
  rpc(name: McpRpc, args: Record<string, unknown>): Promise<unknown>
}

/** Para `ilike`: un `%` o `_` que escribe el usuario es literal, no comodín. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Argumentos de una RPC sin los null ni undefined (ver `rpc` abajo). */
export function withoutNulls(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== null && v !== undefined))
}

// deno-lint-ignore no-explicit-any
export function createSupabaseMcpDb(client: any): McpDb {
  return {
    async select(query) {
      let q = client.from(query.view).select(query.columns.join(', '), query.count ? { count: 'exact' } : undefined)
      for (const f of query.filters ?? []) {
        if (f.op === 'eq') q = q.eq(f.column, f.value)
        else if (f.op === 'in') q = q.in(f.column, f.values)
        else if (f.op === 'gte') q = q.gte(f.column, f.value)
        else if (f.op === 'lt') q = q.lt(f.column, f.value)
        else if (f.op === 'lte') q = q.lte(f.column, f.value)
        else if (f.op === 'contains') q = q.contains(f.column, f.value)
        else if (f.op === 'ilike') q = q.ilike(f.column, `%${escapeLike(f.value)}%`)
        else if (f.op === 'is_null') q = q.is(f.column, null)
        else if (f.op === 'not_null') q = q.not(f.column, 'is', null)
      }
      for (const o of query.order ?? []) q = q.order(o.column, { ascending: o.ascending })
      if (query.range) q = q.range(query.range[0], query.range[1])
      const { data, error, count } = await q
      if (error) throw error
      return { rows: data ?? [], total: count ?? null }
    },
    async rpc(name, args) {
      // GET: el guard de PostgREST no le deja otro método al conector. En GET supabase-js manda
      // un null como el texto "null" (`p_m2_min=null` → error al pasarlo a numeric): los null no
      // se mandan y la función usa su default.
      const { data, error } = await client.rpc(name, withoutNulls(args), { get: true })
      if (error) throw error
      return data
    },
  }
}
