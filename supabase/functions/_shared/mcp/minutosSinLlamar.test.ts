import { assertEquals } from 'jsr:@std/assert@1'
import { minutosSinLlamar } from './minutosSinLlamar.ts'

const filas = [
  { fecha: '2026-11-16', persona_id: 'a', min_sin_llamar: 60, baches: 2 },
  { fecha: '2026-11-17', persona_id: 'a', min_sin_llamar: 15, baches: 1 },
  { fecha: '2026-11-17', persona_id: 'b', min_sin_llamar: 30, baches: 1 },
  { fecha: '2026-11-23', persona_id: 'a', min_sin_llamar: 99, baches: 9 },
]
const semana = { desde: '2026-11-16', hasta: '2026-11-23', nombre: 'semana' }

Deno.test('suma los días del período de esa persona; el hasta no entra', () => {
  assertEquals(minutosSinLlamar(filas, ['a'], semana), { min_sin_llamar: 75, baches: 3, dias_con_dato: 2 })
})

Deno.test('varias personas suman juntas y un día cuenta una vez', () => {
  assertEquals(minutosSinLlamar(filas, ['a', 'b'], semana), { min_sin_llamar: 105, baches: 4, dias_con_dato: 2 })
})

Deno.test('sin ninguna fila es null, no cero (hoy antes del cron)', () => {
  const hoy = { desde: '2026-11-19', hasta: '2026-11-20', nombre: 'hoy' }
  assertEquals(minutosSinLlamar(filas, ['a'], hoy), { min_sin_llamar: null, baches: null, dias_con_dato: 0 })
})

Deno.test('un día con cero sí es dato', () => {
  const dia = { desde: '2026-11-18', hasta: '2026-11-19', nombre: 'mié' }
  const conCero = [{ fecha: '2026-11-18', persona_id: 'a', min_sin_llamar: 0, baches: 0 }]
  assertEquals(minutosSinLlamar(conCero, ['a'], dia), { min_sin_llamar: 0, baches: 0, dias_con_dato: 1 })
})
