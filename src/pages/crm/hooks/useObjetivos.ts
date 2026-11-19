import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { diaDeObjetivos, leadsConDecisor, llamadasDesdeLaUltimaDemo, objetivosDe } from '../lib/objetivos'
import { puedeVerComo } from '../lib/permisos'
import { relojDeEspana } from '@/pages/agenda/lib/horaDeEspana'
import { actividadDesde, demosAgendadas, historialDeActividad, metasDeActividad, minutosSinLlamarDelDia, presentacionesEnviadas, ultimaDemoAgendada } from '../service/crm.service'
import type { Usuario } from '../types'
import { useCarteras } from './useCarteras'
import { useVerComo } from './useVerComo'
import { CRM_KEYS } from './keys'

/** Medianoche LOCAL del día, en UTC: el día es el de quien mira, no el del servidor. */
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()

/** Los objetivos de `autor` en [desde, hasta). Una sola definición para el contador, la lista y el
 *  diálogo: con la misma clave es la misma consulta. */
function consultaDeObjetivos(autor: string, desde: string, hasta: string) {
  return {
    queryKey: CRM_KEYS.llamadasEntre(autor, desde, hasta),
    queryFn: async () => {
      const [d, h] = [inicioDelDia(desde), inicioDelDia(hasta)]
      const [llamadas, demos, presentaciones] = await Promise.all([
        metasDeActividad(autor, d, h),
        demosAgendadas(autor, d, h),
        presentacionesEnviadas(autor, d, h),
      ])
      // Para saber si un decisor es nuevo hace falta lo de antes en esos leads, de cualquiera.
      const historial = await historialDeActividad(leadsConDecisor(llamadas), h)
      return objetivosDe(llamadas, demos, { presentaciones, historial })
    },
  }
}

/** En la URL, de quién son los objetivos que muestra el contador (y filtra `?objetivo=`). Sin él,
 *  los míos (o los de «Ver como»). */
export const OBJETIVOS_DE_PARAM = 'objetivosDe'

/**
 * De quién se miran los «Objetivos de hoy» (17/11/2026, por pedido): quien ve otras carteras elige
 * arriba del contador sin abrir «Comparar». Las opciones son las del diálogo: yo y `puedeVerComo`.
 * Un `?objetivosDe=` que no está entre ellas se ignora.
 */
export function usePersonaDeObjetivos() {
  const { perspectivaId, cargando } = useVerComo()
  const { yo, usuarios, accesos } = useCarteras()
  const [params, setParams] = useSearchParams()
  const elegibles = useMemo(() => {
    const otros = puedeVerComo(yo, usuarios, accesos)
    return yo ? [yo as Usuario, ...otros] : otros
  }, [yo, usuarios, accesos])
  const pedido = params.get(OBJETIVOS_DE_PARAM)
  const personaId = pedido && elegibles.some(u => u.id === pedido) ? pedido : perspectivaId
  const elegir = (id: string) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (id === perspectivaId) next.delete(OBJETIVOS_DE_PARAM)
    else next.set(OBJETIVOS_DE_PARAM, id)
    return next
  }, { replace: true })
  return { personaId, elegibles, elegir, cargando }
}

/** En la URL, qué día muestran los «Objetivos de hoy» (y filtra `?objetivo=`). Sin él, hoy. */
export const OBJETIVOS_DIA_PARAM = 'objetivosDia'

/**
 * El día de los «Objetivos de hoy» (18/11/2026, por pedido): las flechas del contador van a días
 * anteriores. Uno roto o del futuro se ignora (`diaDeObjetivos`); volver a hoy saca el parámetro.
 */
export function useDiaDeObjetivos() {
  const [params, setParams] = useSearchParams()
  const hoy = localTodayIso()
  const dia = diaDeObjetivos(params.get(OBJETIVOS_DIA_PARAM), hoy)
  const irA = (otro: string) => setParams(prev => {
    const next = new URLSearchParams(prev)
    const valido = diaDeObjetivos(otro, hoy)
    if (valido === hoy) next.delete(OBJETIVOS_DIA_PARAM)
    else next.set(OBJETIVOS_DIA_PARAM, valido)
    return next
  }, { replace: true })
  return { dia, esHoy: dia === hoy, hoy, irA }
}

/** Las llamadas y demos de la persona elegida (`usePersonaDeObjetivos`) del día elegido
 *  (`useDiaDeObjetivos`): [dia, dia + 1). Son las suyas y no las de las carteras que estoy mirando:
 *  es el día de trabajo de quien llama. La usan el contador y la lista (para `?objetivo=`), y con
 *  la misma clave es una sola consulta. */
export function useObjetivos(activo = true) {
  const { personaId, cargando } = usePersonaDeObjetivos()
  const { dia } = useDiaDeObjetivos()
  return useQuery({
    ...consultaDeObjetivos(personaId ?? '', dia, shiftIsoDate(dia, 1)),
    enabled: !!personaId && activo && !cargando,
  })
}

/** «Hacia la próxima demo» de `autor` (17/11/2026, por pedido): las llamadas desde su última demo
 *  agendada, **sin corte por día**. Solo agendar una demo lo vuelve a cero. */
export function useHaciaLaProximaDemo(autor: string | null) {
  return useQuery({
    queryKey: CRM_KEYS.haciaLaProximaDemo(autor ?? ''),
    queryFn: async () => {
      const ultima = await ultimaDemoAgendada(autor!)
      const llamadas = await actividadDesde(autor!, ultima)
      return llamadasDesdeLaUltimaDemo(llamadas, ultima)
    },
    enabled: !!autor,
  })
}

/** Una consulta por cada persona y período: lo que compara el diálogo de Objetivos. */
export function useObjetivosDeVarios(pedidos: readonly { autor: string; desde: string; hasta: string }[], activo: boolean) {
  return useQueries({
    queries: pedidos.map(p => ({ ...consultaDeObjetivos(p.autor, p.desde, p.hasta), enabled: activo })),
  })
}

/** «Minutos sin llamar» del día elegido en los Objetivos (19/11/2026, por pedido): lo guarda una vez
 *  por día el cron de Aircall (19:05, por el conector MCP), así que hoy hasta entonces es null. Sin
 *  día, el de hoy en España, como el dato. */
export function useMinutosSinLlamar(persona: string | null, diaElegido?: string) {
  const dia = diaElegido ?? relojDeEspana(new Date()).ymd
  return useQuery({
    queryKey: CRM_KEYS.minutosSinLlamar(persona ?? '', dia),
    queryFn: () => minutosSinLlamarDelDia(persona!, dia),
    enabled: !!persona,
  })
}
