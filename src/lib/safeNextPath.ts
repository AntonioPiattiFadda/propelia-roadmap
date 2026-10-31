/**
 * Valida el `?next=` al que se vuelve después del login. Sólo rutas internas: un `next`
 * con dominio (`https://…`, `//evil.com`, `/\evil.com`) convertiría al login en un open
 * redirect, que es justo lo que se usa para phishing de credenciales.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  return raw
}
