import { describe, it, expect } from 'vitest'
import { signState, verifyState } from '../../../../supabase/functions/_shared/oauthState'

// Sin `Buffer`: el tsconfig de este repo no trae los tipos de Node.
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const b64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const KEY = b64(new Uint8Array(32).fill(3))
const OTHER_KEY = b64(new Uint8Array(32).fill(4))

const payload = {
  userId: '5f7a9c1e-0000-0000-0000-000000000abc',
  redirectOrigin: 'http://localhost:4100',
  iat: 1_752_580_800_000, // 2026-07-15T12:00:00Z
  nonce: 'nonce-de-prueba-123',
}

describe('oauthState', () => {
  it('firma y verifica en round-trip', async () => {
    const state = await signState(payload, KEY)
    const verified = await verifyState(state, KEY, { now: payload.iat + 1000 })
    expect(verified).toEqual(payload)
  })

  it('rechaza payload adulterado', async () => {
    const state = await signState(payload, KEY)
    const [body, sig] = state.split('.')
    const evil = b64url(JSON.stringify({ ...payload, redirectOrigin: 'https://evil.com' }))
    expect(await verifyState(`${evil}.${sig}`, KEY, { now: payload.iat })).toBeNull()
    expect(await verifyState(`${body}.${sig}x`, KEY, { now: payload.iat })).toBeNull()
  })

  it('rechaza firma de otra clave', async () => {
    const state = await signState(payload, OTHER_KEY)
    expect(await verifyState(state, KEY, { now: payload.iat })).toBeNull()
  })

  it('rechaza state vencido (default 10 min)', async () => {
    const state = await signState(payload, KEY)
    expect(await verifyState(state, KEY, { now: payload.iat + 11 * 60 * 1000 })).toBeNull()
    expect(await verifyState(state, KEY, { now: payload.iat + 9 * 60 * 1000 })).not.toBeNull()
  })

  it('rechaza payload sin nonce (states del formato viejo)', async () => {
    const legacy = { userId: payload.userId, redirectOrigin: payload.redirectOrigin, iat: payload.iat }
    const state = await signState(legacy as never, KEY)
    expect(await verifyState(state, KEY, { now: payload.iat })).toBeNull()
  })

  it('rechaza iat futuro más allá del margen de reloj (60s)', async () => {
    const state = await signState(payload, KEY)
    expect(await verifyState(state, KEY, { now: payload.iat - 120_000 })).toBeNull()
    expect(await verifyState(state, KEY, { now: payload.iat - 30_000 })).not.toBeNull()
  })

  it('rechaza basura sin explotar', async () => {
    expect(await verifyState('garbage', KEY)).toBeNull()
    expect(await verifyState('a.b', KEY)).toBeNull()
    expect(await verifyState('', KEY)).toBeNull()
  })
})
