/* El puente con Propelia (onboarding de clientes). Contrato en docs/onboarding/PUENTE.md.

   Del navegador a acá llega `{ action, ...params }` con la sesión del Roadmap. Si quien llama
   es SUPERADMIN activo, se reenvía tal cual a `roadmap-bridge` de Propelia, servidor a
   servidor, con el secreto compartido y su email como `actor`. La respuesta de Propelia
   vuelve igual, status incluido: el contrato es el de allá. */

export const ACCIONES = [
  'list_organizations',
  'get_organization',
  'create_org_with_users',
  'import_template',
  'check_properties',
  'import_properties',
  'simulated_inbound_scenarios',
  'send_simulated_inbound',
  'list_payment_plans',
  'create_payment_link',
  'list_payment_links',
  'activate_tour_group',
] as const

export type PuenteDb = {
  /** La fila del que llama en `public.users`, o null si no tiene. */
  quienLlama(id: string): Promise<{ email: string; rol: string; activo: boolean } | null>
}

export type PuenteDeps = {
  db: PuenteDb
  /** `PROPELIA_BRIDGE_URL` y `PROPELIA_BRIDGE_SECRET`. Sin alguno, el puente no anda. */
  url: string | undefined
  secreto: string | undefined
  fetch: typeof fetch
}

export type Respuesta = { status: number; body: unknown }

const error = (status: number, codigo: string, message: string): Respuesta => ({ status, body: { error: codigo, message } })

export async function reenviar(callerId: string | null, body: unknown, deps: PuenteDeps): Promise<Respuesta> {
  if (!callerId) return error(401, 'invalid_session', 'Tu sesión venció: volvé a entrar.')

  const yo = await deps.db.quienLlama(callerId)
  if (!yo || !yo.activo || yo.rol !== 'SUPERADMIN') {
    return error(403, 'forbidden', 'Sólo un SUPERADMIN puede usar el onboarding.')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return error(400, 'bad_request', 'El cuerpo tiene que ser un objeto JSON.')
  }
  const pedido = body as Record<string, unknown>
  if (!ACCIONES.includes(pedido.action as typeof ACCIONES[number])) {
    return error(400, 'bad_request', `Acción desconocida: ${String(pedido.action)}.`)
  }

  if (!deps.url || !deps.secreto) {
    console.error('propelia-bridge: faltan PROPELIA_BRIDGE_URL o PROPELIA_BRIDGE_SECRET')
    return error(502, 'upstream_error', 'El puente con Propelia no está configurado.')
  }

  // `actor` lo pone el puente, nunca el navegador: es quien queda registrado en Propelia.
  const { actor: _ignorado, ...resto } = pedido
  let res: Response
  try {
    res = await deps.fetch(deps.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': deps.secreto },
      body: JSON.stringify({ ...resto, actor: { email: yo.email } }),
    })
  } catch (e) {
    console.error('propelia-bridge: Propelia no responde', e instanceof Error ? e.message : e)
    return error(502, 'upstream_error', 'Propelia no responde. Probá de nuevo en un rato.')
  }

  const respuesta = await res.json().catch(() => null)
  if (respuesta === null) {
    console.error(`propelia-bridge: respuesta no JSON de Propelia (${res.status})`)
    return error(502, 'upstream_error', 'Propelia respondió algo que no se entiende.')
  }
  // Un 401 de allá es el secreto, no la sesión del usuario: no se le muestra como «volvé a entrar».
  if (res.status === 401) {
    console.error('propelia-bridge: Propelia rechazó el secreto del puente')
    return error(502, 'upstream_error', 'El puente con Propelia está mal configurado (secreto).')
  }
  return { status: res.status, body: respuesta }
}
