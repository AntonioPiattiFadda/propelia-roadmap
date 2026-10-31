import { assertEquals } from 'jsr:@std/assert@1'
import { auditRow, totalCostUsd } from './audit.ts'

const BASE = { userId: 'u1', oauthClientId: 'claude', tool: 'una_tool_paga', args: {}, resultCount: 6, ok: true }

Deno.test('auditRow: el costo queda como total y detalle por proveedor', () => {
  const costs = [
    { provider: 'google_geocoding', usd: 0.005 },
    { provider: 'apify:idealista', usd: 0.0185, run_id: 'run1', items: 30 },
  ]
  const row = auditRow({ ...BASE, costs })
  assertEquals(row.cost_usd, 0.0235)
  assertEquals(row.cost_detail, costs)
})

Deno.test('auditRow: una tool que no gasta deja el costo en null', () => {
  const row = auditRow({ ...BASE, tool: 'get_me' })
  assertEquals([row.cost_usd, row.cost_detail], [null, null])
  assertEquals(auditRow({ ...BASE, costs: [] }).cost_usd, null)
})

Deno.test('totalCostUsd: ignora un costo que no es número', () => {
  assertEquals(totalCostUsd([{ provider: 'a', usd: 0.1 }, { provider: 'b', usd: NaN }]), 0.1)
})
