import { assertEquals } from 'jsr:@std/assert@1'
import { actividadDe, demoVieja, diasEntre, horaEnEspana, hoyEnEspana } from './crm.ts'

Deno.test('actividadDe: tipo y con quién de la meta, nunca el teléfono', () => {
  const meta = '<!--act-->' + JSON.stringify({ tipo: 'llamada', con: ['Ana'], telefono: { numero: '+34600' } })
  assertEquals(actividadDe('MANUAL', meta), { tipo: 'llamada', con: ['Ana'] })
  assertEquals(actividadDe('MANUAL', '<!--act-->{"tipo":"fallido"}'), { tipo: 'contacto fallido', con: [] })
})

Deno.test('actividadDe: sistema, nota sin meta y meta rota', () => {
  assertEquals(actividadDe('SYSTEM', null), { tipo: 'sistema', con: [] })
  assertEquals(actividadDe('MANUAL', null), { tipo: 'nota', con: [] })
  assertEquals(actividadDe('MANUAL', '<!--act-->{roto'), { tipo: 'nota', con: [] })
})

Deno.test('hoyEnEspana: a las 23:30 UTC del 31/12 en Madrid ya es 1/1', () => {
  assertEquals(hoyEnEspana(new Date('2026-12-31T23:30:00Z')), '2027-01-01')
})

Deno.test('actividadDe: el registro de una demo trae el decisor apuntado y la reunión', () => {
  const meta = '<!--act-->' + JSON.stringify({ tipo: 'demo', con: ['Marta'], decisorApuntado: 'Jordi', reunion: 'm1' })
  assertEquals(actividadDe('MANUAL', meta), { tipo: 'demo agendada', con: ['Marta'], decisorApuntado: 'Jordi', reunion: 'm1' })
})

Deno.test('demoVieja: quién asiste y las notas, sin el renglón de la invitación ni emails sueltos', () => {
  assertEquals(
    demoVieja('Invitación a: ana@inmo.es\nAsisten: Ana, Pere\nQuiere ver matching\nescribir a pere@inmo.es'),
    { asistentes: ['Ana', 'Pere'], notas: 'Quiere ver matching\nescribir a [email]' },
  )
  assertEquals(demoVieja(null), { asistentes: [], notas: '' })
})

Deno.test('horaEnEspana y diasEntre', () => {
  assertEquals(horaEnEspana('2026-10-31T09:00:00Z'), 'sáb 31/10/2026 10:00')
  assertEquals(horaEnEspana('no'), null)
  assertEquals(diasEntre('2026-10-01T00:00:00Z', '2026-10-31T12:00:00Z'), 30)
})
