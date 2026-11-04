import { useQueries, useQuery } from '@tanstack/react-query'
import { localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { leadsConDecisor, objetivosDe } from '../lib/objetivos'
import { demosAgendadas, historialDeActividad, metasDeActividad, presentacionesEnviadas } from '../service/crm.service'
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

/** Mis llamadas y demos desde el día `desde` hasta hoy inclusive. Son las mías y no las de las
 *  carteras que estoy mirando: es el día de trabajo de quien llama (o de quien se mira con «Ver como»). La usan el contador y la lista
 *  (para `?objetivo=`), y con la misma clave es una sola consulta. */
export function useObjetivos(desde: string, activo = true) {
  // Con «Ver como», las de la persona que se mira: es su día de trabajo el que se viene a ver.
  const { perspectivaId: myId, cargando } = useVerComo()
  const hasta = shiftIsoDate(localTodayIso(), 1)
  return useQuery({
    ...consultaDeObjetivos(myId ?? '', desde, hasta),
    enabled: !!myId && activo && !cargando,
  })
}

/** Una consulta por cada persona y período: lo que compara el diálogo de Objetivos. */
export function useObjetivosDeVarios(pedidos: readonly { autor: string; desde: string; hasta: string }[], activo: boolean) {
  return useQueries({
    queries: pedidos.map(p => ({ ...consultaDeObjetivos(p.autor, p.desde, p.hasta), enabled: activo })),
  })
}
