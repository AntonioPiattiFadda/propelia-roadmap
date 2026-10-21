import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken } from '../../../../supabase/functions/_shared/tokenCrypto'

// Sin `Buffer`: el tsconfig de este repo no trae los tipos de Node.
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

// 32 bytes fijos para tests (NO es la clave real)
const KEY = b64(new Uint8Array(32).fill(7))
const OTHER_KEY = b64(new Uint8Array(32).fill(9))

describe('tokenCrypto', () => {
  it('cifra y descifra en round-trip', async () => {
    const encrypted = await encryptToken('1//refresh-token-de-google', KEY)
    expect(encrypted).not.toContain('refresh-token')
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/)
    const decrypted = await decryptToken(encrypted, KEY)
    expect(decrypted).toBe('1//refresh-token-de-google')
  })

  it('dos cifrados del mismo texto difieren (IV aleatorio)', async () => {
    const a = await encryptToken('mismo-texto', KEY)
    const b = await encryptToken('mismo-texto', KEY)
    expect(a).not.toBe(b)
  })

  it('descifrar con otra clave lanza', async () => {
    const encrypted = await encryptToken('secreto', KEY)
    await expect(decryptToken(encrypted, OTHER_KEY)).rejects.toThrow()
  })

  it('payload corrupto lanza', async () => {
    await expect(decryptToken('no-es-un-payload', KEY)).rejects.toThrow()
  })

  it('clave que no es de 32 bytes lanza', async () => {
    const shortKey = b64(new Uint8Array(16).fill(1))
    await expect(encryptToken('x', shortKey)).rejects.toThrow()
  })
})
