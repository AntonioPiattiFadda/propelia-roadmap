import { bolsasDeLlamada } from './actividad'

/* Los números de «Objetivos»: las tres bolsas de llamadas y las demos que agendé. Cada uno además
   dice QUÉ leads son, para que tocar el número filtre la lista (`?objetivo=`). Los números cuentan
   llamadas y demos —tres llamadas al mismo lead son tres—; el filtro, leads. */
export const OBJETIVOS = ['contestadas', 'decisores', 'noRespondidas', 'demos'] as const
export type Objetivo = typeof OBJETIVOS[number]

export type ObjetivosDelPeriodo = {
  resumen: Record<Objetivo, number>
  leads: Record<Objetivo, ReadonlySet<string>>
}

/** Un valor desconocido en la URL es «sin filtro»: un enlace roto no deja la lista vacía. */
export function esObjetivo(v: string | null | undefined): v is Objetivo {
  return (OBJETIVOS as readonly string[]).includes(v ?? '')
}

export function objetivosDe(
  llamadas: readonly { lead_id: string | null; long_description: string | null }[],
  demos: readonly { lead_id: string | null }[],
): ObjetivosDelPeriodo {
  const resumen = { contestadas: 0, decisores: 0, noRespondidas: 0, demos: 0 }
  const leads = { contestadas: new Set<string>(), decisores: new Set<string>(), noRespondidas: new Set<string>(), demos: new Set<string>() }
  for (const c of llamadas) {
    for (const k of bolsasDeLlamada(c.long_description)) {
      resumen[k]++
      if (c.lead_id) leads[k].add(c.lead_id)
    }
  }
  for (const d of demos) {
    resumen.demos++
    if (d.lead_id) leads.demos.add(d.lead_id)
  }
  return { resumen, leads }
}
