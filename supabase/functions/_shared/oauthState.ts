// State CSRF del flujo OAuth: payload firmado con HMAC-SHA256 (clave = TOKEN_ENCRYPTION_KEY).
// Módulo puro: sin Deno.* — importable desde Vitest y edge functions.

export interface OAuthStatePayload {
  userId: string
  redirectOrigin: string
  iat: number
  nonce: string
}

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000
const MAX_CLOCK_SKEW_MS = 60 * 1000

const b64urlEncode = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const b64urlDecode = (value: string): Uint8Array<ArrayBuffer> => {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

const importHmacKey = async (keyB64: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )

export const signState = async (payload: OAuthStatePayload, keyB64: string): Promise<string> => {
  const key = await importHmacKey(keyB64)
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${b64urlEncode(new Uint8Array(signature))}`
}

export const verifyState = async (
  state: string,
  keyB64: string,
  opts: { maxAgeMs?: number; now?: number } = {},
): Promise<OAuthStatePayload | null> => {
  const [body, signature] = state.split('.')
  if (!body || !signature) return null
  try {
    const key = await importHmacKey(keyB64)
    // crypto.subtle.verify compara en tiempo constante
    const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(signature), new TextEncoder().encode(body))
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as OAuthStatePayload
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.redirectOrigin !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.nonce !== 'string'
    ) {
      return null
    }
    const now = opts.now ?? Date.now()
    if (payload.iat - now > MAX_CLOCK_SKEW_MS) return null
    if (now - payload.iat > (opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return null
    return payload
  } catch {
    return null
  }
}
