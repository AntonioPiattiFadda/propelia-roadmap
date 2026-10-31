import { assertEquals } from 'jsr:@std/assert@1'
import { actividadDe, hoyEnEspana } from './crm.ts'

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
