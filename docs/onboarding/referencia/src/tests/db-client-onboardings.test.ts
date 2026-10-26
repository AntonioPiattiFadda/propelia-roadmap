import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Database } from '@/types/database.types'
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

let superadmin: { id: string; email: string; orgId: string }
let user: { id: string; email: string; orgId: string }
const onboardingIds: string[] = []

async function signInAs(email: string) {
  const client = createClient<Database>(supabaseUrl, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  expect(error).toBeNull()
  return client
}

async function createOnboarding(client: Awaited<ReturnType<typeof signInAs>>) {
  const { data, error } = await client.rpc('client_onboarding_create', {
    p_agency_name: 'Inmobiliaria Test Onboarding',
    p_owner_first_name: 'Marta',
    p_owner_last_name: 'Ruiz',
    p_owner_phone: '+34611223344',
  })
  expect(error).toBeNull()
  onboardingIds.push(data!)
  return data!
}

beforeAll(async () => {
  superadmin = await createOrgOwner(admin, 'onb-sa')
  await admin.from('users').update({ role: 'superadmin' }).eq('id', superadmin.id)
  user = await createOrgOwner(admin, 'onb-user')
})

afterAll(async () => {
  if (onboardingIds.length) await admin.from('client_onboardings').delete().in('id', onboardingIds)
  for (const o of [superadmin, user]) {
    if (!o) continue
    await deleteTestOrganization(admin, o.orgId)
    await admin.auth.admin.deleteUser(o.id)
  }
})

describe('client_onboardings', () => {
  it('el alta crea el onboarding con su responsable', async () => {
    const client = await signInAs(superadmin.email)
    const id = await createOnboarding(client)

    const { data: row } = await client.from('client_onboardings').select('agency_name, created_by, organization_id').eq('id', id).single()
    expect(row).toEqual({ agency_name: 'Inmobiliaria Test Onboarding', created_by: superadmin.id, organization_id: null })

    const { data: members } = await client.from('client_onboarding_members').select('first_name, phone, role, is_owner, is_contact').eq('onboarding_id', id)
    expect(members).toEqual([{ first_name: 'Marta', phone: '+34611223344', role: 'admin', is_owner: true, is_contact: true }])
  })

  it('no admite dos responsables en la misma alta', async () => {
    const client = await signInAs(superadmin.email)
    const id = await createOnboarding(client)
    const { error } = await client
      .from('client_onboarding_members')
      .insert({ onboarding_id: id, first_name: 'Otro', is_owner: true })
    expect(error?.code).toBe('23505')
  })

  it('cambiar la persona de contacto deja una sola', async () => {
    const client = await signInAs(superadmin.email)
    const id = await createOnboarding(client)
    const { data: other } = await client
      .from('client_onboarding_members')
      .insert({ onboarding_id: id, first_name: 'Jon', phone: '+34622334455' })
      .select('id')
      .single()

    expect((await client.rpc('client_onboarding_set_contact', { p_member_id: other!.id })).error).toBeNull()
    const { data } = await client.from('client_onboarding_members').select('first_name').eq('onboarding_id', id).eq('is_contact', true)
    expect(data).toEqual([{ first_name: 'Jon' }])
  })

  it('marcar una tarea guarda quién la hizo; desmarcarla la borra', async () => {
    const client = await signInAs(superadmin.email)
    const id = await createOnboarding(client)

    expect((await client.from('client_onboarding_tasks').insert({ onboarding_id: id, task_id: 'contacto.enviar' })).error).toBeNull()
    const { data: task } = await client.from('client_onboarding_tasks').select('done_by').eq('onboarding_id', id).single()
    expect(task?.done_by).toBe(superadmin.id)

    await client.from('client_onboarding_tasks').delete().eq('onboarding_id', id).eq('task_id', 'contacto.enviar')
    const { data: left } = await client.from('client_onboarding_tasks').select('task_id').eq('onboarding_id', id)
    expect(left).toEqual([])
  })

  it('los mensajes vienen sembrados y el superadmin los edita, pero no crea ni borra', async () => {
    const client = await signInAs(superadmin.email)
    const { data } = await client.from('onboarding_message_templates').select('id').order('id')
    expect(data!.map((t) => t.id)).toEqual(['configurar_organizacion', 'contacto_inicial', 'integrar_portales'])

    const { data: before } = await admin.from('onboarding_message_templates').select('body').eq('id', 'integrar_portales').single()
    const update = await client.from('onboarding_message_templates').update({ body: 'Texto de prueba' }).eq('id', 'integrar_portales')
    expect(update.error).toBeNull()
    await admin.from('onboarding_message_templates').update({ body: before!.body }).eq('id', 'integrar_portales')

    const insert = await client.from('onboarding_message_templates').insert({ id: 'nuevo', body: 'x' })
    expect(insert.error).not.toBeNull()
    await client.from('onboarding_message_templates').delete().eq('id', 'contacto_inicial')
    const { data: still } = await admin.from('onboarding_message_templates').select('id').eq('id', 'contacto_inicial')
    expect(still).toHaveLength(1)
  })

  it('un usuario que no es superadmin no ve ni escribe nada', async () => {
    const sa = await signInAs(superadmin.email)
    const id = await createOnboarding(sa)
    const client = await signInAs(user.email)

    expect((await client.from('client_onboardings').select('id')).data).toEqual([])
    expect((await client.from('client_onboarding_members').select('id')).data).toEqual([])
    expect((await client.from('onboarding_message_templates').select('id')).data).toEqual([])

    const rpc = await client.rpc('client_onboarding_create', {
      p_agency_name: 'X',
      p_owner_first_name: 'X',
      p_owner_last_name: '',
      p_owner_phone: '',
    })
    expect(rpc.error?.code).toBe('42501')

    const { data: owner } = await admin.from('client_onboarding_members').select('id').eq('onboarding_id', id).single()
    const contact = await client.rpc('client_onboarding_set_contact', { p_member_id: owner!.id })
    expect(contact.error?.code).toBe('42501')

    const task = await client.from('client_onboarding_tasks').insert({ onboarding_id: id, task_id: 'contacto.enviar' })
    expect(task.error).not.toBeNull()
  })
})
