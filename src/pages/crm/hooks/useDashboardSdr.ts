import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { escribirMetaSdr, ID_META_SDR, leerMetaSdr, llamadasPorMes, mesesHaciaAtras } from '../lib/dashboardSdr'
import { demosDelSdr, metasDeActividad, registrosDeDemos, tareasDeConfirmarCompletadas } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/** Medianoche LOCAL del día, en UTC (como `useObjetivos`). */
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()

/* Lo que lee el Dashboard SDR de una persona: los últimos 12 meses (el mes en curso y los 11 de
   antes) de sus llamadas registradas, las demos que agendó, los registros de esas demos y las tareas
   «Confirmar la demo…» completadas de sus leads. La RLS recorta como siempre: lo de otro sale de lo
   que yo puedo leer. Solo corre con el diálogo abierto. */
export function useDashboardSdr(persona: string | null, activo: boolean) {
  const hoy = localTodayIso()
  const desde = `${mesesHaciaAtras(hoy.slice(0, 7), 12)[11]}-01`
  return useQuery({
    queryKey: CRM_KEYS.dashboardSdr(persona ?? '', desde),
    enabled: !!persona && activo,
    queryFn: async () => {
      const d = inicioDelDia(desde)
      const h = inicioDelDia(shiftIsoDate(hoy, 1))
      const [actividades, reuniones] = await Promise.all([metasDeActividad(persona!, d, h), demosDelSdr(persona!, d)])
      const leadIds = [...new Set(reuniones.map(r => r.lead_id).filter((x): x is string => !!x))]
      const [registros, tareas] = await Promise.all([registrosDeDemos(leadIds), tareasDeConfirmarCompletadas(leadIds)])
      return { llamadas: llamadasPorMes(actividades), reuniones, registros, tareas }
    },
  })
}

/* La meta (demos realizadas por mes) es una sola, del equipo, en una fila de `roadmap_notas` como
   las notas de la Caja: sin migración. La edita solo un SUPERADMIN, y eso es solo del front. */
export function useMetaSdr(activo: boolean) {
  return useQuery({
    queryKey: CRM_KEYS.metaSdr,
    enabled: activo,
    queryFn: async () => {
      const { data, error } = await supabase.from('roadmap_notas').select('texto').eq('id', ID_META_SDR).maybeSingle()
      if (error) throw error
      return leerMetaSdr(data?.texto)
    },
  })
}

export function useGuardarMetaSdr() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (meta: number) => {
      const { error } = await supabase.from('roadmap_notas').upsert({ id: ID_META_SDR, texto: escribirMetaSdr(meta), titulo: '', orden: 0 })
      if (error) throw error
      return meta
    },
    onSuccess: meta => { qc.setQueryData(CRM_KEYS.metaSdr, meta); toast.success(`Meta: ${meta} demos realizadas por mes`) },
    onError: () => toast.error('No se pudo guardar la meta'),
  })
}
