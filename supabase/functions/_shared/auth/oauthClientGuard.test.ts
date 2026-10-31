import { assertEquals } from 'jsr:@std/assert@1'
import { decodeJwtPayload, isOAuthClientToken, rejectOAuthClientToken, withoutOAuthClients } from './oauthClientGuard.ts'

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'HS256' }))}.${b64url(JSON.stringify(payload))}.firma`

const SESION = jwt({ sub: 'u1', role: 'authenticated' })
const CONECTOR = jwt({ sub: 'u1', role: 'authenticated', client_id: 'claude' })

Deno.test('isOAuthClientToken: sólo un Bearer con client_id', () => {
  assertEquals(isOAuthClientToken(`Bearer ${CONECTOR}`), true)
  assertEquals(isOAuthClientToken(`bearer   ${CONECTOR}`), true)
  assertEquals(isOAuthClientToken(`Bearer ${SESION}`), false)
  assertEquals(isOAuthClientToken(`Bearer ${jwt({ client_id: '' })}`), false)
  assertEquals(isOAuthClientToken(null), false)
  assertEquals(isOAuthClientToken('Bearer no-es-un-jwt'), false)
  assertEquals(isOAuthClientToken(CONECTOR), false)
})

Deno.test('decodeJwtPayload: base64url sin padding y basura', () => {
  // `?>?` en base64 da `+` y `/`: en base64url llegan como `-` y `_`.
  assertEquals(decodeJwtPayload(jwt({ a: '?>?>??' })), { a: '?>?>??' })
  assertEquals(decodeJwtPayload('a.%%%.c'), null)
  assertEquals(decodeJwtPayload(''), null)
})

Deno.test('withoutOAuthClients: 403 al conector sin llamar al handler, el resto pasa', async () => {
  let calls = 0
  const handler = withoutOAuthClients(() => {
    calls++
    return new Response('ok')
  })
  const blocked = await handler(new Request('https://x', { headers: { Authorization: `Bearer ${CONECTOR}` } }))
  assertEquals(blocked.status, 403)
  assertEquals((await blocked.json()).error, 'oauth_client_forbidden')
  assertEquals(calls, 0)

  assertEquals(await (await handler(new Request('https://x', { headers: { Authorization: `Bearer ${SESION}` } }))).text(), 'ok')
  assertEquals(await (await handler(new Request('https://x'))).text(), 'ok')
  assertEquals(calls, 2)
})

Deno.test('rejectOAuthClientToken: null para una sesión normal', () => {
  assertEquals(rejectOAuthClientToken(new Request('https://x', { headers: { Authorization: `Bearer ${SESION}` } })), null)
})
