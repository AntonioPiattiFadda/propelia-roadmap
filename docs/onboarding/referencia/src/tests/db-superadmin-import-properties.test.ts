import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Database, Json } from '@/types/database.types'
import { deleteTestOrganization } from './helpers/teardown'
import { createOrgOwner, TEST_PASSWORD } from './helpers/users'

const supabaseUrl = process.env.VITE_APP_SUPABASE_URL!
const anonKey = process.env.VITE_APP_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('Faltan variables de entorno.')
}

const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type ImportResult =
  | { status: 'created'; property_id: string; linked_leads: number }
  | { status: 'skipped_existing'; property_id: string }

// El superadmin vive en SU org; el import escribe en la del cliente (target).
let superadmin: { id: string; email: string; orgId: string }
let target: { id: string; email: string; orgId: string }

async function signInAs(email: string) {
  const client = createClient<Database>(supabaseUrl, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  expect(error).toBeNull()
  return client
}

function importRow(code: string | null, extra: Record<string, unknown> = {}) {
  return {
    property: {
      property_type: 'apartment', for_sale: true, for_rent: false, sale_price: 250000, price: 250000,
      operation_type: 'sale', bedrooms: 3, bathrooms: 2, has_elevator: true, has_balcony: false,
      sqm_built: 85, address_visibility: 'exact', idealista_property_id: code,
      ...extra,
    },
    address: { street: 'Carrer de Manso', street_number: '58', city: 'Barcelona', postal_code: '08015' },
  }
}

async function runImport(email: string, orgId: string, rows: unknown[]) {
  const client = await signInAs(email)
  return client.rpc('superadmin_import_properties', { p_org_id: orgId, p_rows: rows as Json })
}

beforeAll(async () => {
  superadmin = await createOrgOwner(admin, 'imp-sa')
  await admin.from('users').update({ role: 'superadmin' }).eq('id', superadmin.id)
  target = await createOrgOwner(admin, 'imp-target')
})

afterAll(async () => {
  for (const o of [superadmin, target]) {
    if (!o) continue
    await deleteTestOrganization(admin, o.orgId)
    await admin.auth.admin.deleteUser(o.id)
  }
})

describe('superadmin_import_properties', () => {
  it('crea propiedad y dirección en la org elegida, sin agentes', async () => {
    const code = `9${Date.now()}`
    const { data, error } = await runImport(superadmin.email, target.orgId, [
      // Campos de más en el JSON no se escriben: la org y los agentes los decide el RPC.
      importRow(code, { organization_id: superadmin.orgId, commercialized_by: superadmin.id }),
    ])
    expect(error).toBeNull()
    const [result] = data as unknown as ImportResult[]
    expect(result).toMatchObject({ status: 'created', linked_leads: 0 })

    const { data: prop } = await admin.from('properties')
      .select('organization_id, captured_by, commercialized_by, idealista_property_id, sale_price, bedrooms, address:addresses!properties_address_id_fkey(organization_id, street, street_number, city)')
      .eq('id', result.property_id).single()
    expect(prop).toMatchObject({
      organization_id: target.orgId,
      captured_by: null,
      commercialized_by: null,
      idealista_property_id: code,
      sale_price: 250000,
      bedrooms: 3,
      address: { organization_id: target.orgId, street: 'Carrer de Manso', street_number: '58', city: 'Barcelona' },
    })
  })

  it('saltea un código que ya está en la org, también si se repite en el mismo lote', async () => {
    const code = `8${Date.now()}`
    const { data: existing } = await admin.from('properties')
      .insert({ organization_id: target.orgId, title: 'Ya cargada', idealista_property_id: code })
      .select('id').single()
    const fresh = `7${Date.now()}`

    const { data, error } = await runImport(superadmin.email, target.orgId, [
      importRow(code), importRow(fresh), importRow(fresh),
    ])
    expect(error).toBeNull()
    const results = data as unknown as ImportResult[]
    expect(results.map(r => r.status)).toEqual(['skipped_existing', 'created', 'skipped_existing'])
    expect(results[0].property_id).toBe(existing!.id)
    expect(results[2].property_id).toBe(results[1].property_id)

    // La que ya estaba no se tocó.
    const { data: untouched } = await admin.from('properties').select('title, bedrooms').eq('id', existing!.id).single()
    expect(untouched).toEqual({ title: 'Ya cargada', bedrooms: null })
  })

  it('vincula los leads que llegaron antes del import esperando ese código', async () => {
    const code = `6${Date.now()}`
    const { data: lead } = await admin.rpc('create_lead_with_client', {
      p_first_name: 'Cliente', p_last_name: 'Import', p_lead_type: 'BUYER',
      p_phone: `+346${String(Date.now()).slice(-8)}`,
      p_organization_id: target.orgId, p_assigned_to: target.id,
    })
    const leadId = (lead as unknown as { lead_id: string }).lead_id
    const { data: stage } = await admin.from('property_funnel_stages')
      .select('id').match({ organization_id: target.orgId, value: 'NEW_LEAD' }).single()
    const { data: pending } = await admin.from('lead_properties').insert({
      organization_id: target.orgId, lead_id: leadId, property_id: null,
      property_funnel_stage_id: stage!.id, pending_ad_code: code,
    }).select('id').single()
    await admin.from('tasks').insert({
      organization_id: target.orgId, title: 'Sincronizar inmueble de Idealista',
      assigned_to: target.id, created_by: target.id,
      entity_type: 'lead_comprador', entity_id: leadId,
      action_type: 'sync_idealista_property', action_id: code,
    })

    // Dos filas con código en el mismo lote: la cascada corre dos veces en una transacción.
    const { data, error } = await runImport(superadmin.email, target.orgId, [
      importRow(`5${Date.now()}`), importRow(code),
    ])
    expect(error).toBeNull()
    const results = data as unknown as ImportResult[]
    expect(results[1]).toMatchObject({ status: 'created', linked_leads: 1 })

    // El cruce pendiente se rellenó en su lugar (misma fila) y la tarea quedó cerrada.
    const { data: links } = await admin.from('lead_properties')
      .select('id, property_id, pending_ad_code').eq('lead_id', leadId).is('deleted_at', null)
    expect(links).toEqual([{ id: pending!.id, property_id: results[1].property_id, pending_ad_code: null }])
    const { data: task } = await admin.from('tasks')
      .select('completed').match({ entity_id: leadId, action_id: code }).single()
    expect(task!.completed).toBe(true)
  })

  it('un usuario que no es superadmin no puede importar, ni en su propia org', async () => {
    const { error } = await runImport(target.email, target.orgId, [importRow(`4${Date.now()}`)])
    expect(error?.message).toContain('Sólo un superadmin')
  })

  it('la cascada con org por parámetro no está expuesta a usuarios', async () => {
    const client = await signInAs(target.email)
    const { error } = await client.rpc('resolve_sync_tasks_for_ad_in_org', {
      p_org_id: superadmin.orgId, p_action_id: '1', p_property_id: superadmin.id,
    })
    expect(error?.message.toLowerCase()).toContain('permission denied')
  })
})
