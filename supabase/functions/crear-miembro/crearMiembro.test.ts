import { assertEquals } from 'jsr:@std/assert@1'
import { colorLibre, crearMiembro, inicialesDe, PALETA } from './crearMiembro.ts'
import type { CrearMiembroDb, CrearMiembroInput } from './crearMiembro.ts'

const VALIDO: CrearMiembroInput = { email: 'Nuevo@Example.com ', password: 'Test1234!', nombre: 'Juan Pérez', rol: 'SDR' }

type Fila = Parameters<CrearMiembroDb['crearFila']>[0]

function fakeDb(over: Partial<CrearMiembroDb> = {}) {
  const llamadas = { filas: [] as Fila[], borradas: [] as string[], cuentas: [] as string[] }
  const db: CrearMiembroDb = {
    quienLlama: async () => ({ rol: 'SUPERADMIN', activo: true }),
    coloresUsados: async () => [],
    crearCuenta: async ({ email }) => { llamadas.cuentas.push(email); return { id: 'nuevo-id' } },
    crearFila: async fila => { llamadas.filas.push(fila); return {} },
    borrarCuenta: async id => { llamadas.borradas.push(id) },
    ...over,
  }
  return { db, llamadas }
}

Deno.test('inicialesDe: un nombre solo son sus dos primeras letras', () => assertEquals(inicialesDe('lorenzo'), 'LO'))
Deno.test('inicialesDe: nombre y apellido son la primera de cada uno', () => assertEquals(inicialesDe(' Juan  Pérez '), 'JP'))
Deno.test('inicialesDe: una letra sola no se inventa la segunda', () => assertEquals(inicialesDe('x'), 'X'))

Deno.test('colorLibre: el primero de la paleta que nadie usa', () =>
  assertEquals(colorLibre([PALETA[0], PALETA[1].toLowerCase()]), PALETA[2]))
Deno.test('colorLibre: con la paleta llena, da la vuelta', () =>
  assertEquals(colorLibre([...PALETA, '#000000']), PALETA[(PALETA.length + 1) % PALETA.length]))

Deno.test('crearMiembro: sin fila quien llama no pasa', async () => {
  const { db, llamadas } = fakeDb({ quienLlama: async () => null })
  const r = await crearMiembro('c', VALIDO, db)
  assertEquals(r.ok ? 0 : r.status, 403)
  assertEquals(llamadas.cuentas.length, 0)
})

Deno.test('crearMiembro: un SDR no da altas', async () => {
  const { db } = fakeDb({ quienLlama: async () => ({ rol: 'SDR', activo: true }) })
  const r = await crearMiembro('c', VALIDO, db)
  assertEquals(r.ok ? 0 : r.status, 403)
})

Deno.test('crearMiembro: un SUPERADMIN inactivo no da altas', async () => {
  const { db } = fakeDb({ quienLlama: async () => ({ rol: 'SUPERADMIN', activo: false }) })
  const r = await crearMiembro('c', VALIDO, db)
  assertEquals(r.ok ? 0 : r.status, 403)
})

Deno.test('crearMiembro: valida email, contraseña, nombre y rol', async () => {
  for (const malo of [
    { ...VALIDO, email: 'sin-arroba' },
    { ...VALIDO, password: '12345' },
    { ...VALIDO, nombre: '   ' },
    { ...VALIDO, rol: 'ADMIN' },
  ]) {
    const { db, llamadas } = fakeDb()
    const r = await crearMiembro('c', malo, db)
    assertEquals(r.ok ? 0 : r.status, 400)
    assertEquals(llamadas.cuentas.length, 0)
  }
})

Deno.test('crearMiembro: crea la cuenta y la fila, con caja en false', async () => {
  const { db, llamadas } = fakeDb({ coloresUsados: async () => [PALETA[0]] })
  const r = await crearMiembro('c', VALIDO, db)
  assertEquals(r, { ok: true, user: { id: 'nuevo-id', email: 'nuevo@example.com' } })
  assertEquals(llamadas.cuentas, ['nuevo@example.com'])
  assertEquals(llamadas.filas, [{
    id: 'nuevo-id', email: 'nuevo@example.com', nombre: 'Juan Pérez', iniciales: 'JP',
    color: PALETA[1], rol: 'SDR', caja: false, activo: true,
  }])
})

Deno.test('crearMiembro: email repetido se dice en castellano', async () => {
  const { db } = fakeDb({ crearCuenta: async () => ({ error: 'A user with this email address has already been registered' }) })
  const r = await crearMiembro('c', VALIDO, db)
  assertEquals(r, { ok: false, status: 400, error: 'Ese email ya está registrado' })
})

Deno.test('crearMiembro: si la fila falla, borra la cuenta recién creada', async () => {
  const { db, llamadas } = fakeDb({ crearFila: async () => ({ error: 'boom' }) })
  const r = await crearMiembro('c', VALIDO, db)
  assertEquals(r.ok ? 0 : r.status, 500)
  assertEquals(llamadas.borradas, ['nuevo-id'])
})
