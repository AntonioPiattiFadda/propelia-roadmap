import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensajeDeError } from '../lib/errores'
import {
  borrarEtiqueta, borrarGasto, cambiarPagador, confirmarPago, crearEtiqueta, crearGasto, editarEtiqueta, editarGasto, propagarCambio,
  type AlcancePropagacion, type CambiosPropagables,
} from '../service/caja.service'
import { CAJA_KEYS } from './keys'

/* Sin optimismo: son pocas filas y quien escribe espera el resultado (el combobox crea una
   etiqueta y la selecciona con `mutateAsync`). Al terminar, bien o mal, se re-trae todo `['caja']`. */
export function useCajaMutaciones() {
  const qc = useQueryClient()
  const opciones = (porDefecto: string) => ({
    onError: (e: unknown) => { toast.error(mensajeDeError(e, porDefecto)) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CAJA_KEYS.todo }) },
  })
  return {
    crearGasto: useMutation({ mutationFn: crearGasto, ...opciones('No se pudo guardar el gasto.') }),
    confirmarPago: useMutation({
      mutationFn: (v: { id: string } & Parameters<typeof confirmarPago>[1]) => confirmarPago(v.id, v),
      ...opciones('No se pudo confirmar el pago.'),
    }),
    cambiarPagador: useMutation({
      mutationFn: (v: { id: string; paid_by: string }) => cambiarPagador(v.id, v.paid_by),
      ...opciones('No se pudo cambiar quién lo pagó.'),
    }),
    editarGasto: useMutation({
      mutationFn: (v: { id: string; patch: Parameters<typeof editarGasto>[1] }) => editarGasto(v.id, v.patch),
      ...opciones('No se pudo guardar el gasto.'),
    }),
    borrarGasto: useMutation({ mutationFn: borrarGasto, ...opciones('No se pudo borrar el gasto.') }),
    crearEtiqueta: useMutation({ mutationFn: crearEtiqueta, ...opciones('No se pudo crear la etiqueta.') }),
    editarEtiqueta: useMutation({
      mutationFn: (v: { id: string; patch: Parameters<typeof editarEtiqueta>[1] }) => editarEtiqueta(v.id, v.patch),
      ...opciones('No se pudo guardar la etiqueta.'),
    }),
    borrarEtiqueta: useMutation({ mutationFn: borrarEtiqueta, ...opciones('No se pudo borrar la etiqueta.') }),
    propagarCambio: useMutation({
      mutationFn: (v: { etiquetaId: string; cambios: CambiosPropagables; scope: AlcancePropagacion; mesActual: string }) =>
        propagarCambio(v.etiquetaId, v.cambios, v.scope, v.mesActual),
      ...opciones('No se pudieron actualizar los gastos.'),
    }),
  }
}
