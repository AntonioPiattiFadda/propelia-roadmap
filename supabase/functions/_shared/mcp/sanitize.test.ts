import { assertEquals } from 'jsr:@std/assert@1'
import { cleanText, isSensitiveKey, sanitizeOutput } from './sanitize.ts'
import { auditArgs, auditRow } from './audit.ts'

Deno.test('sanitizeOutput: saca claves sensibles a cualquier profundidad y avisa dónde', () => {
  const { value, removed } = sanitizeOutput({
    properties: [{ id: 'p1', city: 'Barcelona', street: 'Calle X', location: { postal_code: '08036', district: 'Eixample' } }],
    owner: { first_name: 'Ana', phone: '600', email: 'a@b.c' },
    internal_notes: 'secreto',
  })
  assertEquals(value, { properties: [{ id: 'p1', city: 'Barcelona', location: { district: 'Eixample' } }], owner: {} })
  assertEquals(removed.sort(), [
    'internal_notes', 'owner.email', 'owner.first_name', 'owner.phone', 'properties[0].location.postal_code', 'properties[0].street',
  ])
})

Deno.test('sanitizeOutput: la salida de get_me pasa entera (nada que sacar)', () => {
  const { value, removed } = sanitizeOutput({ found: true, nombre: 'Lorenzo', rol: 'SUPERADMIN' })
  assertEquals(removed, [])
  assertEquals(value, { found: true, nombre: 'Lorenzo', rol: 'SUPERADMIN' })
})

Deno.test('isSensitiveKey: planta y descripción se entregan; dirección exacta y catastro no', () => {
  for (const ok of ['floor', 'description', 'title', 'valuation_id', 'city', 'district', 'neighborhood', 'province', 'address_visibility']) {
    assertEquals(isSensitiveKey(ok), false, ok)
  }
  for (const no of ['street', 'street_number', 'door', 'postal_code', 'latitude', 'longitude', 'google_place_id', 'cadastral_reference', 'internal_notes', 'contact_data', 'api_key', 'valuation_price', 'acquisition_notes']) {
    assertEquals(isSensitiveKey(no), true, no)
  }
})

Deno.test('cleanText: saca caracteres de control e invisibles, conserva saltos simples y corta', () => {
  assertEquals(cleanText('a\u0000b\u202ec\u200bd'), 'a b c d')
  assertEquals(cleanText('uno\n\n\n\ndos'), 'uno\n\ndos')
  assertEquals(cleanText('x'.repeat(10), 5), 'xxxx…')
})

Deno.test('auditArgs / auditRow: sólo primitivos, textos cortos, error recortado', () => {
  assertEquals(auditArgs({ city: 'x'.repeat(300), limit: 5, nested: { a: 1 }, on: true }), { city: `${'x'.repeat(99)}…`, limit: 5, on: true })
  const row = auditRow({
    userId: 'u1', oauthClientId: 'c1', tool: 'get_me', args: {}, resultCount: 0, ok: false,
    error: 'e'.repeat(1000), removedKeys: [],
  })
  assertEquals(row.error!.length, 300)
  assertEquals(row.removed_keys, null)
})

Deno.test('sanitizeOutput: allowKeys deja pasar sólo esas claves exactas (Catastro)', () => {
  const { value, removed } = sanitizeOutput(
    { units: [{ cadastral_reference: 'R', address: { street: 'MALLORCA', postal_code: '08029' }, phone: '600' }] },
    { allowKeys: ['cadastral_reference', 'street', 'postal_code'] },
  )
  assertEquals(value, { units: [{ cadastral_reference: 'R', address: { street: 'MALLORCA', postal_code: '08029' } }] })
  assertEquals(removed, ['units[0].phone'])
})
