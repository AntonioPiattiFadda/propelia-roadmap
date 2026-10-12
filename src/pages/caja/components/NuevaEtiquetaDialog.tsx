import type { Etiqueta, TipoGasto } from '../types'
import { FormularioEtiqueta } from './FormularioEtiqueta'

/** «Nueva etiqueta». Va encima del alta de gasto o del gestor: devuelve la creada para que quien
    la abrió la deje elegida. Montarlo solo cuando hay que mostrarlo. */
export function NuevaEtiquetaDialog({ nombre, tipo, etiquetas, guardando, onCrear, onCerrar }: {
  nombre: string
  tipo: TipoGasto
  etiquetas: Etiqueta[]
  guardando: boolean
  onCrear: (valores: { name: string; expense_type: TipoGasto; default_amount: number | null; due_day: number | null }) => Promise<Etiqueta>
  onCerrar: () => void
}) {
  return (
    <FormularioEtiqueta
      titulo="Nueva etiqueta"
      textoGuardar="Crear etiqueta"
      inicial={{ name: nombre, tipo, monto: '', dia: '' }}
      etiquetas={etiquetas}
      guardando={guardando}
      onGuardar={async v => { await onCrear(v) }}
      onCerrar={onCerrar}
    />
  )
}
