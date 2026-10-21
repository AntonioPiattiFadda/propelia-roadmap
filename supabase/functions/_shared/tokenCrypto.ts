// Cifrado simétrico de tokens OAuth en reposo (AES-256-GCM).
// Módulo puro: sin Deno.* — importable desde Vitest y edge functions.

const fromB64 = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))

const toB64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const importAesKey = async (keyB64: string): Promise<CryptoKey> => {
  const raw = fromB64(keyB64)
  if (raw.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY debe ser 32 bytes en base64')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export const encryptToken = async (plain: string, keyB64: string): Promise<string> => {
  const key = await importAesKey(keyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return `${toB64(iv)}.${toB64(new Uint8Array(cipher))}`
}

export const decryptToken = async (payload: string, keyB64: string): Promise<string> => {
  const [ivB64, dataB64] = payload.split('.')
  if (!ivB64 || !dataB64) throw new Error('payload cifrado inválido')
  const key = await importAesKey(keyB64)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(dataB64))
  return new TextDecoder().decode(plain)
}
