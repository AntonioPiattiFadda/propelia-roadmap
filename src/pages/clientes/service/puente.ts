import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/* Todo lo que el onboarding le pide al producto (Propelia) pasa por la edge function
   `propelia-bridge` del Roadmap (contrato en docs/onboarding/PUENTE.md). El front nunca le habla
   directo al producto.

   `PUENTE_SIMULADO` en true responde con los ejemplos de PUENTE.md sin salir del navegador (lo
   creado se recuerda en el localStorage) y no crea nada en Propelia: sirve para probar la página
   sin el puente. Desde el 27/10/2026 las diez acciones más `create_org_with_users` existen de los
   dos lados (`propelia-bridge` acá, `roadmap-bridge` en propelia-frontend), así que va en false:
   todo pega contra Propelia de verdad. */
export const PUENTE_SIMULADO = false

export type OrgDePropelia = { id: string; name: string; website?: string | null }
export type AgenteDePropelia = {
  id: string; name: string; email: string | null; role: string; slug: string | null; inbound_address: string | null
  /** Cuándo entró a su cuenta por primera y por última vez; null = todavía no entró. Opcionales: un
   *  `roadmap-bridge` de antes del 28/10/2026 no los manda. */
  first_sign_in_at?: string | null; last_sign_in_at?: string | null
}
export type OrgConAgentes = OrgDePropelia & { agents: AgenteDePropelia[]; org_inbound_address: string | null; properties_count: number }
export type UsuarioParaCrear = { first_name: string; last_name: string; email: string; phone: string; role: 'admin' | 'agent'; is_owner: boolean; password: string }
export type ColumnaDeCartera = { key: string; header: string; example: string | number }
export type FilaRevisada = { row_number: number; valid: boolean; errors: string[]; warnings: string[]; existing_property_id: string | null; summary: Record<string, unknown> }
export type ResultadoDeFila = { row_number: number; status: 'created' | 'skipped_existing' | 'invalid'; property_id?: string; errors?: string[] }
/** Sin período: los planes de Propelia son mensuales (`roadmap-bridge` › `listPaymentPlans`). */
export type PlanDePago = { id: string; code?: string; name: string; amount_cents: number; currency?: string; individual: boolean }
export type LinkDePago = { id: string; url: string; status: 'open' | 'paid' | 'linked'; created_at?: string; expires_at?: string; paid_at?: string | null; amount_cents?: number }

/** Máximo de filas por llamada a `import_properties` (PUENTE.md). */
export const FILAS_POR_LOTE = 50

async function invocar<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  if (PUENTE_SIMULADO) return simular(action, params) as Promise<T>
  const { data, error } = await supabase.functions.invoke<T>('propelia-bridge', { body: { action, ...params } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.message ?? 'Propelia no contestó')
    }
    throw error
  }
  if (!data) throw new Error('Propelia no contestó')
  return data
}

/** `website` (opcional) queda en la configuración de la org en Propelia (Ajustes › Marca). */
export const crearOrgConUsuarios = (organization_name: string, users: UsuarioParaCrear[], website: string | null = null) =>
  invocar<{ organization: OrgDePropelia }>('create_org_with_users', { organization_name, users, ...(website ? { website } : {}) })
export const getOrganizacion = (org_id: string) =>
  invocar<{ organization: OrgConAgentes }>('get_organization', { org_id }).then(r => r.organization)
export const getColumnasDeCartera = () =>
  invocar<{ columns: ColumnaDeCartera[] }>('import_template').then(r => r.columns)
export const revisarCartera = (org_id: string, sheet: string[][]) =>
  invocar<{ ok: true; rows: FilaRevisada[] } | { ok: false; error: string }>('check_properties', { org_id, sheet })
export const importarLoteDeCartera = (org_id: string, header: string[], rows: { row_number: number; cells: string[] }[]) =>
  invocar<{ results: ResultadoDeFila[] }>('import_properties', { org_id, header, rows }).then(r => r.results)
export const getPlanes = (org_id: string) =>
  invocar<{ plans: PlanDePago[] }>('list_payment_plans', { org_id }).then(r => r.plans)
export const crearLinkDePago = (p: { plan_id: string; org_id: string; customer_email: string | null; note: string }) =>
  invocar<{ link: LinkDePago }>('create_payment_link', { ...p, amount_cents: null }).then(r => r.link)
export const getLinksDePago = (org_id: string) =>
  invocar<{ links: LinkDePago[] }>('list_payment_links', { org_id }).then(r => r.links)
export const enviarLeadDePrueba = (org_id: string) =>
  invocar<{ email_id: string; to: string }>('send_simulated_inbound', { org_id, user_slug: null, scenario_id: 'dip-visita' })

// ---------- Simulación ----------
/* Lo creado se recuerda en este navegador (localStorage, con try/catch), para que la org, sus
   agentes y los links sigan ahí al recargar. No es un dato del equipo: es de mentira. */
const CLAVE = 'clientes-puente-simulado'
type Memoria = { orgs: Record<string, OrgConAgentes>; links: Record<string, LinkDePago[]> }
const leer = (): Memoria => {
  try { return { orgs: {}, links: {}, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') } } catch { return { orgs: {}, links: {} } }
}
const guardar = (m: Memoria) => { try { localStorage.setItem(CLAVE, JSON.stringify(m)) } catch { /* sin storage: se pierde al recargar */ } }
const slug = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const DOMINIO = 'inbound.propelia.es'
const COLUMNAS: ColumnaDeCartera[] = [
  ['idealista_code', 'Código anuncio Idealista', '108765432'], ['property_type', 'Tipo', 'Piso'],
  ['street', 'Calle', 'Carrer de Manso'], ['number', 'Número', '58'], ['postal_code', 'Código postal', '08015'],
  ['city', 'Ciudad', 'Barcelona'], ['operation', 'Operación', 'Venta'], ['sale_price', 'Precio venta', '250000'],
  ['rent_price', 'Precio alquiler', ''], ['bedrooms', 'Habitaciones', '3'], ['bathrooms', 'Baños', '2'],
  ['elevator', 'Ascensor', 'Sí'], ['built_m2', 'm² construidos', '85'], ['balcony', 'Balcón', 'No'],
].map(([key, header, example]) => ({ key, header, example }))

async function simular(action: string, p: Record<string, unknown>): Promise<unknown> {
  await new Promise(r => setTimeout(r, 400))
  const m = leer()
  switch (action) {
    case 'create_org_with_users': {
      const name = String(p.organization_name)
      const users = p.users as UsuarioParaCrear[]
      const id = crypto.randomUUID()
      m.orgs[id] = {
        id, name, properties_count: 0, org_inbound_address: `leads.${slug(name)}@${DOMINIO}`,
        agents: users.map(u => ({
          id: crypto.randomUUID(), name: `${u.first_name} ${u.last_name}`.trim(), email: u.email, role: u.role, slug: slug(u.first_name),
          inbound_address: `leads.${slug(name)}.${slug(u.first_name)}@${DOMINIO}`,
        })),
      }
      guardar(m)
      return { organization: { id, name, website: (p.website as string | undefined) ?? null } }
    }
    case 'get_organization': {
      const org = m.orgs[String(p.org_id)]
      if (!org) throw new Error('La organización no existe en Propelia (simulado: se creó en otro navegador).')
      return { organization: org }
    }
    case 'import_template': return { columns: COLUMNAS }
    case 'check_properties': {
      const [cab, ...filas] = p.sheet as string[][]
      if (!cab?.length) return { ok: false, error: 'El archivo está vacío.' }
      return {
        ok: true,
        rows: filas.map((f, i) => {
          const errors = f.slice(1, 4).some(c => !String(c ?? '').trim()) ? ['Faltan tipo, calle o número'] : []
          return { row_number: i + 2, valid: !errors.length, errors, warnings: f[0] ? [] : ['Sin código de Idealista'], existing_property_id: null, summary: { address: `${f[2] ?? ''} ${f[3] ?? ''}, ${f[5] ?? ''}`.trim() } }
        }),
      }
    }
    case 'import_properties': {
      const rows = p.rows as { row_number: number }[]
      const org = m.orgs[String(p.org_id)]
      if (org) { org.properties_count += rows.length; guardar(m) }
      return { results: rows.map(r => ({ row_number: r.row_number, status: 'created', property_id: crypto.randomUUID() })) }
    }
    case 'list_payment_plans':
      return { plans: [{ id: 'pro', name: 'Pro', amount_cents: 19900, individual: false }, { id: 'basic', name: 'Básico', amount_cents: 9900, individual: false }] }
    case 'create_payment_link': {
      const org = String(p.org_id)
      const link: LinkDePago = {
        id: crypto.randomUUID(), url: `https://propelia.lemonsqueezy.com/checkout/simulado-${org.slice(0, 8)}`, status: 'open',
        created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), amount_cents: p.plan_id === 'basic' ? 9900 : 19900,
      }
      m.links[org] = [link, ...(m.links[org] ?? [])]
      guardar(m)
      return { link }
    }
    case 'list_payment_links': return { links: m.links[String(p.org_id)] ?? [] }
    case 'send_simulated_inbound': return { email_id: `re_simulado_${Date.now()}`, to: m.orgs[String(p.org_id)]?.org_inbound_address ?? `leads@${DOMINIO}` }
    default: throw new Error(`Acción desconocida: ${action}`)
  }
}
