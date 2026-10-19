import { assertEquals } from 'jsr:@std/assert@1'
import { reactivarMiembro } from './reactivarMiembro.ts'
import type { ReactivarMiembroDb } from './reactivarMiembro.ts'

function fakeDb(over: Partial<ReactivarMiembroDb> = {}) {
  const llamadas = { passwords: [] as string[], activados: [] as string[] }
  const db: ReactivarMiembroDb = {
    quienLlama: async () => ({ rol: 'SUPERADMIN', activo: true }),
    miembro: async () => ({ activo: false }),
    cambiarPassword: async (_id, password) => { llamadas.passwords.push(password); return {} },
    activar: async id => { llamadas.activados.push(id); return {} },
    ...over,
  }
  return { db, llamadas }
}

Deno.test('reactivarMiembro: un SDR no reactiva', async () => {
  const { db, llamadas } = fakeDb({ quienLlama: async () => ({ rol: 'SDR', activo: true }) })
  const r = await reactivarMiembro('c', { userId: 'x' }, db)
  assertEquals(r.ok ? 0 : r.status, 403)
  assertEquals(llamadas.activados.length, 0)
})

Deno.test('reactivarMiembro: un SUPERADMIN inactivo no reactiva', async () => {
  const { db } = fakeDb({ quienLlama: async () => ({ rol: 'SUPERADMIN', activo: false }) })
  const r = await reactivarMiembro('c', { userId: 'x' }, db)
  assertEquals(r.ok ? 0 : r.status, 403)
})

Deno.test('reactivarMiembro: sin contraseña la deja como estaba', async () => {
  const { db, llamadas } = fakeDb()
  const r = await reactivarMiembro('c', { userId: 'x', password: '' }, db)
  assertEquals(r, { ok: true })
  assertEquals(llamadas.passwords, [])
  assertEquals(llamadas.activados, ['x'])
})

Deno.test('reactivarMiembro: con contraseña la cambia y activa', async () => {
  const { db, llamadas } = fakeDb()
  const r = await reactivarMiembro('c', { userId: 'x', password: 'Nueva123' }, db)
  assertEquals(r, { ok: true })
  assertEquals(llamadas.passwords, ['Nueva123'])
  assertEquals(llamadas.activados, ['x'])
})

Deno.test('reactivarMiembro: contraseña corta se rechaza antes de tocar nada', async () => {
  const { db, llamadas } = fakeDb()
  const r = await reactivarMiembro('c', { userId: 'x', password: '123' }, db)
  assertEquals(r.ok ? 0 : r.status, 400)
  assertEquals(llamadas.activados.length, 0)
})

Deno.test('reactivarMiembro: si la contraseña falla no activa', async () => {
  const { db, llamadas } = fakeDb({ cambiarPassword: async () => ({ error: 'boom' }) })
  const r = await reactivarMiembro('c', { userId: 'x', password: 'Nueva123' }, db)
  assertEquals(r.ok ? 0 : r.status, 400)
  assertEquals(llamadas.activados.length, 0)
})

Deno.test('reactivarMiembro: a uno activo o inexistente no', async () => {
  const activo = fakeDb({ miembro: async () => ({ activo: true }) })
  assertEquals((await reactivarMiembro('c', { userId: 'x' }, activo.db)), { ok: false, status: 400, error: 'Esa persona ya está activa' })
  const nadie = fakeDb({ miembro: async () => null })
  const r = await reactivarMiembro('c', { userId: 'x' }, nadie.db)
  assertEquals(r.ok ? 0 : r.status, 404)
})
