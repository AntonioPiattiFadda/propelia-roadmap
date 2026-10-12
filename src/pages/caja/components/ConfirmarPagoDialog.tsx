import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayLocal, type CalendarDay } from '@/lib/dates'
import { validarPago } from '../lib/formularios'
import { montoAInput } from '../lib/monto'
import type { Gasto } from '../types'

/** «Confirmar pago — X» de un variable pendiente: el monto real y el día en que se pagó. */
export function ConfirmarPagoDialog({ gasto, guardando, onConfirmar, onCerrar }: {
  gasto: Gasto
  guardando: boolean
  onConfirmar: (pago: { amount: number; date: CalendarDay }) => Promise<void>
  onCerrar: () => void
}) {
  const [monto, setMonto] = useState(montoAInput(gasto.amount))
  const [fecha, setFecha] = useState(todayLocal())
  const [error, setError] = useState('')

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (guardando) return
    const r = validarPago(monto, fecha)
    if ('error' in r) return setError(r.error)
    setError('')
    // Un solo canal de error: el toast de la mutación. Si falla, el dialog sigue abierto.
    try { await onConfirmar(r) } catch { /* ya avisó el toast */ }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="sm:max-w-[400px]">
        <form onSubmit={enviar} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Confirmar pago — {gasto.expense_name}</DialogTitle>
            {gasto.notes && <DialogDescription>{gasto.notes}</DialogDescription>}
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pago-monto" className="text-xs font-semibold text-(--fg-2)">Monto (€) *</Label>
              <Input id="pago-monto" inputMode="decimal" value={monto} onChange={ev => setMonto(ev.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pago-fecha" className="text-xs font-semibold text-(--fg-2)">Fecha de pago *</Label>
              <Input id="pago-fecha" type="date" autoFocus value={fecha} onChange={ev => setFecha(ev.target.value)} />
            </div>
          </div>
          <p role="alert" className="min-h-4 text-xs text-danger">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Confirmar pago'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
