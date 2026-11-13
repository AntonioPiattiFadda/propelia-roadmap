import { estadoDeHitos, type HitoId } from '../_shared/hitosDeOnboarding.ts'

/* La lógica de `onboarding-progreso`, sin Deno ni Supabase para poder probarla. Contrato en
   docs/onboarding/PUENTE.md › «La vuelta: el avance que ve el cliente». */

export type OnboardingDeLaOrg = {
  empresa: string
  iniciado: string
  completado: string | null
  tareas: string[]
}

export type ProgresoDb = {
  /** El alta del lead atado a esa org (`crm_leads.propelia_organization_id`), la más nueva. */
  onboardingDeLaOrg(orgId: string): Promise<{ data: OnboardingDeLaOrg | null; error?: string }>
}

export type Progreso = {
  onboarding: null | { empresa: string; iniciado: string; completado: string | null; hitos: Record<HitoId, boolean> }
}

type Resultado = { ok: true; status: 200; body: Progreso } | { ok: false; status: number; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Compara sin cortar en el primer carácter distinto (`x-bridge-secret`). */
export function mismoSecreto(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  let dif = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return dif === 0
}

export async function progreso(
  p: { secretoRecibido: string | null; secreto: string | undefined; body: Record<string, unknown> },
  db: ProgresoDb,
): Promise<Resultado> {
  // Sin el secreto configurado, nadie entra: un secreto vacío no puede valer.
  if (!p.secreto || !p.secretoRecibido || !mismoSecreto(p.secretoRecibido, p.secreto)) {
    return { ok: false, status: 401, error: 'secreto_invalido' }
  }
  const orgId = p.body.organization_id
  if (typeof orgId !== 'string' || !UUID.test(orgId)) return { ok: false, status: 400, error: 'org_invalida' }

  const { data, error } = await db.onboardingDeLaOrg(orgId)
  if (error) return { ok: false, status: 500, error }
  if (!data) return { ok: true, status: 200, body: { onboarding: null } }

  return {
    ok: true, status: 200,
    body: {
      onboarding: {
        empresa: data.empresa,
        iniciado: data.iniciado,
        completado: data.completado,
        hitos: estadoDeHitos(new Set(data.tareas)),
      },
    },
  }
}
