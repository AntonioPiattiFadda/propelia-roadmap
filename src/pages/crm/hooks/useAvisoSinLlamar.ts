import { useEffect } from 'react'
import { useQueries } from '@tanstack/react-query'
import { toast } from 'sonner'
import { shiftIsoDate } from '@/lib/calendarDate'
import { useSondeaDeFondo } from '@/lib/pestanas'
import { relojDeEspana } from '@/pages/agenda/lib/horaDeEspana'
import { minutosSinLlamarDelDia } from '../service/crm.service'
import { avisoSinLlamar } from '../lib/minutosSinLlamar'
import { CRM_KEYS } from './keys'

/** El cron de Aircall guarda el dato a las 19:05: cada cuánto se pregunta si ya llegó. */
const REFRESCO_MS = 5 * 60_000
/** Hoy y los tres días anteriores: abrir el CRM el lunes avisa lo del viernes. */
const DIAS_HACIA_ATRAS = 3
/** Los días que ya sonaron, por navegador: recargar no vuelve a tirar el aviso. */
const CLAVE_AVISADOS = 'crm-sin-llamar-avisados'

function leerAvisados(): Set<string> {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_AVISADOS) ?? '[]') as unknown
    if (Array.isArray(crudo)) return new Set(crudo.filter((c): c is string => typeof c === 'string'))
  } catch { /* storage bloqueado o basura */ }
  return new Set()
}

function guardarAvisados(ids: Set<string>) {
  try { localStorage.setItem(CLAVE_AVISADOS, JSON.stringify([...ids].slice(-30))) } catch { /* idem */ }
}

/* Cuando «Minutos sin llamar» pasa la hora y queda en rojo (21/11/2026, por pedido), al SDR le sale
   un aviso que no se va solo, y la notificación del navegador si ya dio permiso: que contacte a
   Lorenzo Piatti. Se monta en `AppLayout`: suena aunque esté en otra página. Una vez por día. */
export function useAvisoSinLlamar(yoId: string | null, activo: boolean) {
  const hoy = relojDeEspana(new Date()).ymd
  const dias = Array.from({ length: DIAS_HACIA_ATRAS + 1 }, (_, i) => shiftIsoDate(hoy, -i))
  const deFondo = useSondeaDeFondo() // de fondo sondea una pestaña sola (`lib/pestanas.ts`)
  const consultas = useQueries({
    queries: dias.map(dia => ({
      queryKey: CRM_KEYS.minutosSinLlamar(yoId ?? '', dia),
      queryFn: () => minutosSinLlamarDelDia(yoId!, dia),
      enabled: activo && !!yoId,
      refetchInterval: dia === hoy ? REFRESCO_MS : false,
      refetchIntervalInBackground: dia === hoy && deFondo,
    })),
  })
  const firma = consultas.map(q => q.data?.min_sin_llamar ?? '').join('|')

  useEffect(() => {
    if (!activo || !yoId) return
    const avisados = leerAvisados()
    let cambio = false
    dias.forEach((dia, i) => {
      const clave = `${yoId}:${dia}`
      const aviso = avisoSinLlamar(consultas[i]?.data?.min_sin_llamar)
      if (!aviso || avisados.has(clave)) return
      avisados.add(clave)
      cambio = true
      const titulo = dia === hoy ? aviso.titulo : `${aviso.titulo} el ${dia.split('-').reverse().join('/')}`
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(titulo, { body: aviso.texto, tag: `sin-llamar-${dia}` }) }
        catch { /* Android Chrome sin service worker: queda el toast */ }
      }
      toast.error(titulo, { description: aviso.texto, duration: Infinity, closeButton: true })
    })
    if (cambio) guardarAvisados(avisados)
    // `firma` resume los datos: los arrays de `useQueries` cambian en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, yoId, firma, hoy])
}
