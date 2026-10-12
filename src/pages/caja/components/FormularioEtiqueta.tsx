import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { validarEtiquetaForm, type EntradaEtiqueta, type ValoresEtiqueta } from '../lib/formularios'
import type { Etiqueta } from '../types'
import { Segmentado } from './Segmentado'

/**
 * El formulario de «Nueva etiqueta» y de «Editar etiqueta» (son el mismo: nombre, tipo, y si es
 * fijo, monto habitual y día de vencimiento). Se monta solo mientras está abierto, así que su
 * estado nace de `inicial` cada vez. El nombre se valida contra TODAS las etiquetas vivas.
 */
export function FormularioEtiqueta({ titulo, textoGuardar, inicial, etiquetas, exceptoId, guardando, onGuardar, onCerrar }: {
  titulo: string
  textoGuardar: string
  inicial: EntradaEtiqueta
  etiquetas: Etiqueta[]
  exceptoId?: string
  guardando: boolean
  onGuardar: (valores: ValoresEtiqueta) => Promise<void>
  onCerrar: () => void
}) {
  const [f, setF] = useState(inicial)
  const r = validarEtiquetaForm(f, etiquetas, exceptoId)
  const error = 'error' in r ? r.error : null
  // «Poné un nombre» no se grita antes de que alguien haya escrito algo: solo apaga el botón.
  const errorVisible = error && f.name.trim() ? error : null
  const fijo = f.tipo === 'FIXED'

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!('valores' in r) || guardando) return
    try { await onGuardar(r.valores) } catch { /* el toast ya lo mostró la mutación; el dialog queda abierto */ }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={enviar} noValidate className="grid gap-4">
          <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="etiqueta-nombre" className="text-xs font-semibold text-(--fg-2)">Nombre</Label>
            <Input id="etiqueta-nombre" autoFocus placeholder="Ej: Alquiler" value={f.name} aria-invalid={!!errorVisible}
              onChange={ev => setF(s => ({ ...s, name: ev.target.value }))} />
            <span className="min-h-4 text-xs text-danger">{errorVisible}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-(--fg-2)">Tipo</span>
            <Segmentado label="Tipo" valor={f.tipo} onChange={tipo => setF(s => ({ ...s, tipo }))}
              opciones={[{ valor: 'FIXED', label: 'Fijo' }, { valor: 'VARIABLE', label: 'Variable' }]} className="self-start" />
            {exceptoId && f.tipo !== inicial.tipo && (
              <p className="text-xs text-(--fg-muted)">Los gastos ya cargados conservan su tipo.</p>
            )}
          </div>
          {fijo && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="etiqueta-monto" className="text-xs font-semibold text-(--fg-2)">Monto habitual (€)</Label>
                <Input id="etiqueta-monto" inputMode="decimal" placeholder="0,00" value={f.monto} onChange={ev => setF(s => ({ ...s, monto: ev.target.value }))} />
                <p className="text-xs text-(--fg-muted)">Se usa como estimado en la lista y al cargar el gasto.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="etiqueta-dia" className="text-xs font-semibold text-(--fg-2)">Día de vencimiento</Label>
                <div className="flex items-center gap-2 text-[13px] text-(--fg-2)">
                  <Input id="etiqueta-dia" type="number" min={1} max={31} placeholder="Ej: 10" className="w-24" value={f.dia}
                    onChange={ev => setF(s => ({ ...s, dia: ev.target.value }))} />
                  de cada mes
                </div>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" disabled={!!error || guardando}>{guardando ? 'Guardando…' : textoGuardar}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
