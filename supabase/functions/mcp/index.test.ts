import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { handleRequest, type AuthResult, type McpDeps } from './index.ts'
import type { McpDb } from '../_shared/mcp/db.ts'
import type { AuditEntry } from '../_shared/mcp/audit.ts'

const ENV: Record<string, string> = { SUPABASE_URL: 'https://ref.supabase.co' }
const MCP_URL = 'https://ref.supabase.co/functions/v1/mcp'

function setup(auth: AuthResult | null = null, whoami: unknown = { nombre: 'Lorenzo', rol: 'SUPERADMIN', email: 'x@y.z' }) {
  const tokens: string[] = []
  const audits: AuditEntry[] = []
  const db: McpDb = {
    select: () => Promise.resolve({ rows: [], total: 0 }),
    rpc: () => (whoami instanceof Error ? Promise.reject(whoami) : Promise.resolve(whoami)),
  }
  const deps: McpDeps = {
    getEnv: (k) => ENV[k],
    authenticate: (token) => {
      tokens.push(token)
      return Promise.resolve(auth ?? { status: 'ok', userId: 'u1', db })
    },
    audit: (entry) => {
      audits.push(entry)
      return Promise.resolve()
    },
  }
  return { deps, tokens, audits }
}

function rpc(body: unknown, token: string | null = 'tok', url = MCP_URL) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-06-18',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
}

/** Un JWT sin firmar con `client_id`, como el que recibe el conector. */
function tokenDeConector(clientId: string) {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b64({ alg: 'none' })}.${b64({ sub: 'u1', client_id: clientId })}.firma`
}

Deno.test('metadata OAuth: pública, apunta a Supabase Auth y su resource es la URL del conector', async () => {
  const { deps, tokens } = setup()
  const res = await handleRequest(new Request(`${MCP_URL}/.well-known/oauth-protected-resource`), deps)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), {
    resource: MCP_URL,
    authorization_servers: ['https://ref.supabase.co/auth/v1'],
    bearer_methods_supported: ['header'],
    resource_name: 'Propelia Roadmap',
  })
  assertEquals(tokens, [])
})

Deno.test('metadata OAuth: en local usa la URL pública, no la interna del runtime', async () => {
  const { deps } = setup()
  deps.getEnv = (k) => ({ SUPABASE_URL: 'http://kong:8000', MCP_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321/' })[k]
  const res = await handleRequest(new Request('http://kong:8000/mcp/.well-known/oauth-protected-resource'), deps)
  const body = await res.json()
  assertEquals(body.resource, 'http://127.0.0.1:54321/functions/v1/mcp')
  assertEquals(body.authorization_servers, ['http://127.0.0.1:54321/auth/v1'])
})

Deno.test('por el proxy del tablero (?via=equipo): resource es equipo.propelia.es/mcp; Auth sigue en Supabase', async () => {
  const { deps } = setup()
  const res = await handleRequest(new Request(`${MCP_URL}/.well-known/oauth-protected-resource?via=equipo`), deps)
  const body = await res.json()
  assertEquals(body.resource, 'https://equipo.propelia.es/mcp')
  assertEquals(body.authorization_servers, ['https://ref.supabase.co/auth/v1'])
})

Deno.test('por el proxy del tablero: el 401 apunta a la metadata bajo equipo.propelia.es', async () => {
  const { deps } = setup()
  const res = await handleRequest(rpc(INITIALIZE, null, `${MCP_URL}?via=equipo`), deps)
  assertEquals(res.status, 401)
  assertEquals(
    res.headers.get('WWW-Authenticate'),
    'Bearer resource_metadata="https://equipo.propelia.es/mcp/.well-known/oauth-protected-resource"',
  )
})

Deno.test('sin token: 401 con el puntero a la metadata, sin tocar Auth', async () => {
  const { deps, tokens } = setup()
  const res = await handleRequest(rpc(INITIALIZE, null), deps)
  assertEquals(res.status, 401)
  assertEquals(
    res.headers.get('WWW-Authenticate'),
    `Bearer resource_metadata="${MCP_URL}/.well-known/oauth-protected-resource"`,
  )
  assertEquals(tokens, [])
})

Deno.test('token inválido: 401 invalid_token para que Claude refresque o pida login', async () => {
  const { deps } = setup({ status: 'invalid' })
  const res = await handleRequest(rpc(INITIALIZE, 'vencido'), deps)
  assertEquals(res.status, 401)
  assertStringIncludes(res.headers.get('WWW-Authenticate') ?? '', 'error="invalid_token"')
  assertStringIncludes(res.headers.get('WWW-Authenticate') ?? '', 'resource_metadata=')
})

Deno.test('cuenta dada de baja: 403, no 401 (un 401 haría que Claude reintente el login en loop)', async () => {
  const { deps } = setup({ status: 'deactivated' })
  const res = await handleRequest(rpc(INITIALIZE), deps)
  assertEquals(res.status, 403)
})

Deno.test('initialize: responde como propelia-roadmap con tools', async () => {
  const { deps, tokens } = setup()
  const res = await handleRequest(rpc(INITIALIZE), deps)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.result.serverInfo.name, 'propelia-roadmap')
  assert(body.result.capabilities.tools)
  assertEquals(tokens, ['tok'])
})

Deno.test('tools/list: todas de sólo lectura', async () => {
  const { deps } = setup()
  const res = await handleRequest(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), deps)
  const { result } = await res.json()
  assert(result.tools.length > 0)
  for (const t of result.tools) {
    assertEquals(t.annotations.readOnlyHint, true, t.name)
    assertEquals(t.annotations.destructiveHint, false, t.name)
  }
})

Deno.test('tools/call get_me: nombre y rol, sin el email; auditada con el client_id del token', async () => {
  const { deps, audits } = setup()
  const req = rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_me', arguments: {} } }, tokenDeConector('claude-123'))
  const { result } = await (await handleRequest(req, deps)).json()
  assertEquals(JSON.parse(result.content[0].text), { found: true, id: 'u1', nombre: 'Lorenzo', rol: 'SUPERADMIN' })
  assertEquals(audits.length, 1)
  assertEquals(audits[0].tool, 'get_me')
  assertEquals(audits[0].oauthClientId, 'claude-123')
  assertEquals(audits[0].ok, true)
  assertEquals(audits[0].resultCount, 1)
})

Deno.test('si la base falla: isError con mensaje genérico, sin filtrar el error', async () => {
  const { deps, audits } = setup(null, new Error('permission denied for table users'))
  const req = rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_me', arguments: {} } })
  const { result } = await (await handleRequest(req, deps)).json()
  assertEquals(result.isError, true)
  assert(!result.content[0].text.includes('permission'))
  assertEquals(audits[0].ok, false)
})
