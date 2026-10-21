import type { LeadNotificationHandler } from '../types.ts'
import {
  createDemoCancelledHandler,
  createDemoRescheduledHandler,
  createDemoScheduledHandler,
  type DemoScheduledDb,
} from './demoScheduled.ts'

/**
 * Registro de handlers por `type`. Un evento nuevo = una entrada nueva acá (y que un SUPERADMIN lo
 * pueda prender: `configurable` en src/pages/ajustes/lib/leadNotifications.ts). Copiado del producto.
 */
export function buildHandlers(deps: {
  demoDb: DemoScheduledDb
  assetsBaseUrl: string
  // deno-lint-ignore no-explicit-any
}): Record<string, LeadNotificationHandler<any>> {
  const demo = { db: deps.demoDb, assetsBaseUrl: deps.assetsBaseUrl }
  const handlers = [
    createDemoScheduledHandler(demo),
    createDemoRescheduledHandler(demo),
    createDemoCancelledHandler(demo),
  ]
  return Object.fromEntries(handlers.map((h) => [h.type, h]))
}
