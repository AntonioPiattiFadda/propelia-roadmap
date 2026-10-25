import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OWNERS_PARAM } from '../lib/leadFilterParams'
import { useCarteras } from './useCarteras'
import { useVerComo } from './useVerComo'

/**
 * Qué carteras está mirando la lista. La selección vive en la URL (`?owners=`) porque la
 * consumen dos árboles que no se tocan —el botón de la cabecera y la lista— y porque un enlace
 * desde Equipo tiene que llegar con la cartera puesta. Ausente = la propia: la URL limpia y la de
 * mi cartera son la misma cosa, y compartir un enlace no arrastra la cartera de otro.
 */
export function useVisibleAgents() {
  const carteras = useCarteras()
  const { myId, visibles, isLoading } = carteras
  // Con «Ver como», «la propia» es la de la persona que se mira (ver `useVerComo`).
  const { perspectivaId, cargando: cargandoComo } = useVerComo()
  const [searchParams, setSearchParams] = useSearchParams()

  /* Ordenados (el mismo par en otro orden sería otra URL) y filtrados contra lo permitido: un id
     pegado a mano no abre la cartera de nadie. Mientras los permisos cargan no se filtra —todo
     id ajeno parecería prohibido y el enlace caería a mi cartera—; la RLS igual recorta. */
  const selectedIds = useMemo<string[] | null>(() => {
    // null = «todavía no sé quién soy»: la sesión llega después del primer render y devolver
    // [] o [undefined] pintaría «Todavía no tenés leads» / una tabla vacía. Quien consume
    // muestra carga mientras sea null.
    // Con un `?como=` sin resolver, lo mismo: caer a mi cartera un instante y saltar a la suya
    // dispara dos consultas y un parpadeo.
    if (!myId || !perspectivaId || cargandoComo) return null
    const fromUrl = (searchParams.get(OWNERS_PARAM) ?? '').split(',').filter(Boolean)
    const allowed = new Set(visibles.map(u => u.id))
    const validos = isLoading ? fromUrl : fromUrl.filter(id => allowed.has(id))
    return validos.length > 0 ? [...new Set(validos)].sort() : [perspectivaId]
  }, [searchParams, myId, perspectivaId, cargandoComo, visibles, isLoading])

  const setSelectedIds = useCallback((ids: string[]) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      const isDefault = ids.length === 0 || (ids.length === 1 && ids[0] === perspectivaId)
      if (isDefault) params.delete(OWNERS_PARAM)
      else params.set(OWNERS_PARAM, [...ids].sort().join(','))
      return params
    }, { replace: true })
  }, [setSearchParams, perspectivaId])

  return { ...carteras, perspectivaId, selectedIds, setSelectedIds, canSeeOthers: visibles.length > 1 }
}
