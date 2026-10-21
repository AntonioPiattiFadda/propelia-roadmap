import { describe, it, expect } from 'vitest'
import { buildGoogleAuthUrl, decodeJwtPayload, GOOGLE_OAUTH_SCOPES, isAllowedRedirectOrigin } from '../../../../supabase/functions/_shared/googleOAuth'

// Sin `Buffer`: el tsconfig de este repo no trae los tipos de Node.
const b64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('buildGoogleAuthUrl', () => {
  it('genera la URL de autorización con offline + consent', () => {
    const url = new URL(
      buildGoogleAuthUrl({ clientId: 'client-123', redirectUri: 'https://x.supabase.co/functions/v1/calendar-oauth-callback', state: 'estado-firmado' }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.supabase.co/functions/v1/calendar-oauth-callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('estado-firmado')
    expect(url.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '))
  })

  it('los scopes incluyen calendar.events y freebusy', () => {
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/calendar.events')
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/calendar.freebusy')
  })
})

describe('decodeJwtPayload', () => {
  it('decodifica el payload de un JWT', () => {
    const payload = b64url(JSON.stringify({ email: 'agente@gmail.com', sub: '123' }))
    const jwt = `${b64url('{"alg":"RS256"}')}.${payload}.firma-fake`
    expect(decodeJwtPayload(jwt)).toEqual({ email: 'agente@gmail.com', sub: '123' })
  })

  it('devuelve null ante basura', () => {
    expect(decodeJwtPayload('no-es-jwt')).toBeNull()
    expect(decodeJwtPayload('a.b')).toBeNull()
    expect(decodeJwtPayload('a.###.c')).toBeNull()
  })
})

describe('isAllowedRedirectOrigin', () => {
  it('sin allowlist configurada solo permite localhost:4100', () => {
    expect(isAllowedRedirectOrigin('http://localhost:4100', undefined)).toBe(true)
    expect(isAllowedRedirectOrigin('https://evil.example', undefined)).toBe(false)
    expect(isAllowedRedirectOrigin('http://localhost:4100', '')).toBe(true)
  })

  it('con allowlist CSV permite exactamente esos origins', () => {
    const csv = 'https://app.propelia.com, http://localhost:4100'
    expect(isAllowedRedirectOrigin('https://app.propelia.com', csv)).toBe(true)
    expect(isAllowedRedirectOrigin('http://localhost:4100', csv)).toBe(true)
    expect(isAllowedRedirectOrigin('https://evil.example', csv)).toBe(false)
    // el default localhost NO aplica cuando hay allowlist explícita sin él
    expect(isAllowedRedirectOrigin('http://localhost:4100', 'https://app.propelia.com')).toBe(false)
  })

  it('matching exacto: ni subdominios ni prefijos pasan', () => {
    const csv = 'https://app.propelia.com'
    expect(isAllowedRedirectOrigin('https://app.propelia.com.evil.example', csv)).toBe(false)
    expect(isAllowedRedirectOrigin('https://app.propelia.com/path', csv)).toBe(false)
  })
})
