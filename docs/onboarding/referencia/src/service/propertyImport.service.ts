import { supabase } from './index'
import { requestAddressCompletion } from './addressCompletion.service'
import { nearestZoneId, type AddressPayload } from './addresses.service'
import type { PropertyInsert } from '@/types/properties.types'
import type { Json } from '@/types/database.types'

export type ImportRowPayload = { property: PropertyInsert; address: AddressPayload | null }

export type ImportRowResult =
  | { status: 'created'; property_id: string; linked_leads: number }
  | { status: 'skipped_existing'; property_id: string }

/** Filas por llamada al RPC. Cada llamada es todo o nada: un lote chico acota lo que se reintenta. */
const RPC_BATCH_SIZE = 50
/** Direcciones completadas en paralelo contra Google. */
const COMPLETION_CONCURRENCY = 4

/**
 * Completa la dirección con Google (escritor de `addresses`: ver CLAUDE.md › Direcciones) y le
 * busca la zona, igual que el autocompletado del form. Nunca lanza: si Google falla, la
 * dirección se guarda como vino.
 */
async function completeImportAddress(address: AddressPayload): Promise<AddressPayload> {
  const completed = await requestAddressCompletion(address)
  if (completed.zone_id || completed.latitude == null || completed.longitude == null) return completed
  return { ...completed, zone_id: await nearestZoneId(completed.latitude, completed.longitude) }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export type ImportProgress = { step: 'addresses' | 'saving'; done: number; total: number }

/**
 * Crea las propiedades en `orgId` (sólo superadmin: el RPC lo exige). Devuelve un resultado
 * por fila, en el mismo orden.
 */
export async function importProperties(
  orgId: string,
  rows: ImportRowPayload[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportRowResult[]> {
  let addressesDone = 0
  const completed = await mapWithConcurrency(rows, COMPLETION_CONCURRENCY, async (row) => {
    const address = row.address ? await completeImportAddress(row.address) : null
    onProgress?.({ step: 'addresses', done: ++addressesDone, total: rows.length })
    return { ...row, address }
  })

  const results: ImportRowResult[] = []
  for (let i = 0; i < completed.length; i += RPC_BATCH_SIZE) {
    const batch = completed.slice(i, i + RPC_BATCH_SIZE)
    const { data, error } = await supabase.rpc('superadmin_import_properties', {
      p_org_id: orgId,
      // Filas de objetos planos (strings, números, booleans, null): JSON válido.
      p_rows: batch as unknown as Json,
    })
    if (error) throw error
    results.push(...(data as unknown as ImportRowResult[]))
    onProgress?.({ step: 'saving', done: results.length, total: rows.length })
  }
  return results
}
