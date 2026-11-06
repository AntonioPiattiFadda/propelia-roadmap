import { assertEquals } from 'jsr:@std/assert@1'
import { mismoSecreto, progreso, type OnboardingDeLaOrg, type ProgresoDb } from './progreso.ts'
import { calendarioListo, estadoDeHitos } from '../_shared/hitosDeOnboarding.ts'

const ORG = '7f3a9c2e-b41d-4e8a-9d5f-2c6b1a0e8f73'
const ALTA: OnboardingDeLaOrg = { empresa: 'Fincas Ribera', iniciado: '2026-11-01T10:00:00Z', completado: null, tareas: [] }

function db(data: OnboardingDeLaOrg | null = ALTA, error?: string) {
  const llamadas: string[] = []
  const d: ProgresoDb = { onboardingDeLaOrg: async id => { llamadas.push(id); return { data, error } } }
  return { d, llamadas }
}

const ninguno = { equipo: false, google: false, idealista: false, portales: false, ia: false, migracion: false, bot: false }

Deno.test('sin secreto, o con otro, es 401 y no llega a la base', async () => {
  const { d, llamadas } = db()
  for (const [recibido, secreto] of [[null, 's'], ['otro', 's'], ['', ''], ['s', undefined]] as const) {
    assertEquals(await progreso({ secretoRecibido: recibido, secreto, body: { organization_id: ORG } }, d),
      { ok: false, status: 401, error: 'secreto_invalido' })
  }
  assertEquals(llamadas.length, 0)
})

Deno.test('una org que no es un uuid es 400', async () => {
  const { d, llamadas } = db()
  assertEquals(await progreso({ secretoRecibido: 's', secreto: 's', body: { organization_id: 'x' } }, d),
    { ok: false, status: 400, error: 'org_invalida' })
  assertEquals(llamadas.length, 0)
})

Deno.test('una org sin alta devuelve onboarding null', async () => {
  const { d } = db(null)
  assertEquals(await progreso({ secretoRecibido: 's', secreto: 's', body: { organization_id: ORG } }, d),
    { ok: true, status: 200, body: { onboarding: null } })
})

Deno.test('el error de la base es 500', async () => {
  const { d } = db(null, 'boom')
  assertEquals(await progreso({ secretoRecibido: 's', secreto: 's', body: { organization_id: ORG } }, d),
    { ok: false, status: 500, error: 'boom' })
})

Deno.test('devuelve el alta con los hitos, sin las tareas', async () => {
  const { d, llamadas } = db({ ...ALTA, tareas: ['contacto.importar-usuarios', 'cartera-leads.importar', 'hito.bot'] })
  assertEquals(await progreso({ secretoRecibido: 's', secreto: 's', body: { organization_id: ORG } }, d), {
    ok: true, status: 200,
    body: { onboarding: { empresa: 'Fincas Ribera', iniciado: ALTA.iniciado, completado: null, hitos: { ...ninguno, equipo: true, bot: true } } },
  })
  assertEquals(llamadas, [ORG])
})

Deno.test('un hito con tareas está hecho con todas; con una sola, no', () => {
  assertEquals(estadoDeHitos(new Set(['contacto.importar-usuarios'])).equipo, false)
  assertEquals(estadoDeHitos(new Set(['cartera-leads.mails-idealista', 'cartera-leads.lead-prueba'])).idealista, true)
})

Deno.test('el tilde a mano lo da por hecho aunque falten tareas; los sin tareas son solo a mano', () => {
  assertEquals(estadoDeHitos(new Set(['hito.portales', 'hito.google', 'hito.ia'])), { ...ninguno, portales: true, google: true, ia: true })
  assertEquals(estadoDeHitos(new Set()), ninguno)
})

Deno.test('calendario: hace falta alguien y que todos estén conectados', () => {
  assertEquals(calendarioListo([]), false)
  assertEquals(calendarioListo([{ calendar_connected: true }, {}]), false)
  assertEquals(calendarioListo([{ calendar_connected: true }, { calendar_connected: true }]), true)
})

Deno.test('mismoSecreto', () => {
  assertEquals(mismoSecreto('abc', 'abc'), true)
  assertEquals(mismoSecreto('abc', 'abd'), false)
  assertEquals(mismoSecreto('abc', 'abcd'), false)
})
