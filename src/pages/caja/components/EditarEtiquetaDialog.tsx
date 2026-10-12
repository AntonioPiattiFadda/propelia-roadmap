import { montoAInput } from '../lib/monto'
import type { Etiqueta, TipoGasto } from '../types'
import { FormularioEtiqueta } from './FormularioEtiqueta'

export function EditarEtiquetaDialog({ etiqueta, etiquetas, guardando, onGuardar, onCerrar }: {
  etiqueta: Etiqueta
  etiquetas: Etiqueta[]
  guardando: boolean
  onGuardar: (valores: { name: string; expense_type: TipoGasto; default_amount: number | null; due_day: number | null }) => Promise<void>
  onCerrar: () => void
}) {
  return (
    <FormularioEtiqueta
      titulo="Editar etiqueta"
      textoGuardar="Guardar"
      inicial={{ name: etiqueta.name, tipo: etiqueta.expense_type, monto: montoAInput(etiqueta.default_amount), dia: etiqueta.due_day ? String(etiqueta.due_day) : '' }}
      etiquetas={etiquetas}
      exceptoId={etiqueta.id}
      guardando={guardando}
      onGuardar={onGuardar}
      onCerrar={onCerrar}
    />
  )
}
