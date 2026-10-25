import { useQuery } from '@tanstack/react-query'
import { localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { objetivosDe } from '../lib/objetivos'
import { demosAgendadas, metasDeActividad } from '../service/crm.service'
import { useVerComo } from './useVerComo'
import { CRM_KEYS } from './keys'

/** Medianoche LOCAL del día, en UTC: el día es el de quien mira, no el del servidor. */
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()

/** Mis llamadas y demos desde el día `desde` hasta hoy inclusive. Son las mías y no las de las
 *  carteras que estoy mirando: es el día de trabajo de quien llama (o de quien se mira con «Ver como»). La usan el contador y la lista
 *  (para `?objetivo=`), y con la misma clave es una sola consulta. */
export function useObjetivos(desde: string, activo = true) {
  // Con «Ver como», las de la persona que se mira: es su día de trabajo el que se viene a ver.
  const { perspectivaId: myId, cargando } = useVerComo()
  const hasta = shiftIsoDate(localTodayIso(), 1)
  return useQuery({
    queryKey: CRM_KEYS.llamadasEntre(myId ?? '', desde, hasta),
    queryFn: async () => {
      const [llamadas, demos] = await Promise.all([
        metasDeActividad(myId!, inicioDelDia(desde), inicioDelDia(hasta)),
        demosAgendadas(myId!, inicioDelDia(desde), inicioDelDia(hasta)),
      ])
      return objetivosDe(llamadas, demos)
    },
    enabled: !!myId && activo && !cargando,
  })
}
