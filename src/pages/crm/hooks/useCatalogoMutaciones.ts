import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensajeDeError } from '../lib/errores'
import {
  actualizarCanal, actualizarEtapa, borrarCanal, borrarEtapa, crearCanal, crearEtapa, reordenarCanales,
  reordenarEtapas,
} from '../service/crm.service'
import { CRM_KEYS } from './keys'

/* El catálogo cambia poco y lo toca uno solo (SUPERADMIN): sin optimismo, se re-trae al terminar.
   Los leads no se invalidan: guardan ids, y el nombre lo resuelve el catálogo. */
export function useCatalogoMutaciones() {
  const qc = useQueryClient()
  const opciones = {
    onError: (e: unknown) => { toast.error(mensajeDeError(e, 'No se pudo guardar el cambio.')) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.catalogos }) },
  }
  return {
    crearEtapa: useMutation({ mutationFn: crearEtapa, ...opciones }),
    actualizarEtapa: useMutation({ mutationFn: (v: { id: string; payload: Parameters<typeof actualizarEtapa>[1] }) => actualizarEtapa(v.id, v.payload), ...opciones }),
    borrarEtapa: useMutation({ mutationFn: borrarEtapa, ...opciones }),
    reordenarEtapas: useMutation({ mutationFn: reordenarEtapas, ...opciones }),
    crearCanal: useMutation({ mutationFn: crearCanal, ...opciones }),
    actualizarCanal: useMutation({ mutationFn: (v: { id: string; payload: { label: string } }) => actualizarCanal(v.id, v.payload), ...opciones }),
    borrarCanal: useMutation({ mutationFn: borrarCanal, ...opciones }),
    reordenarCanales: useMutation({ mutationFn: reordenarCanales, ...opciones }),
  }
}
