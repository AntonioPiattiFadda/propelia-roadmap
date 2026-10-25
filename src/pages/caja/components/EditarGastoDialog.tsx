import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { TablesUpdate } from '@/types/database.types'
import { entradaDeEdicion, validarEdicion } from '../lib/formularios'
import type { Gasto, Pagador } from '../types'
import { PagadorPicker } from './PagadorPicker'
import { ETIQUETA_DE_TIPO } from './PillTipo'

const Campo = ({ htmlFor, label, children }: { htmlFor: string; label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-semibold text-(--fg-2)">{label}</Label>
    {children}
  </div>
)

/**
 * «Editar gasto» de uno ya cargado: monto, fecha, período (fijo), notas (variable) y quién pagó
 * (si está pagado). Etiqueta, tipo y estado no se tocan acá: cambiar de etiqueta es borrarlo y
 * cargarlo de nuevo, y un pendiente se paga con «Pagar». `gastos` avisa si el período cae en un mes
 * que la etiqueta ya tiene pagado (la base lo frena igual con su índice único).
 */
export function EditarGastoDialog({ gasto, gastos, pagadores, guardando, onGuardar, onCerrar }: {
  gasto: Gasto
  gastos: Gasto[]
  pagadores: Pagador[]
  guardando: boolean
  onGuardar: (patch: TablesUpdate<'expenses'>) => Promise<void>
  onCerrar: () => void
}) {
  const [entrada, setEntrada] = useState(() => entradaDeEdicion(gasto))
  const [error, setError] = useState('')
  const poner = <K extends keyof typeof entrada>(k: K, v: (typeof entrada)[K]) => setEntrada(e => ({ ...e, [k]: v }))

  const fijo = gasto.expense_type === 'FIXED'
  const pendiente = gasto.status === 'PENDING'

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (guardando) return
    const r = validarEdicion(gasto, entrada, gastos)
    if ('error' in r) return setError(r.error)
    setError('')
    // Un solo canal de error: el toast de la mutación. Si falla, el dialog sigue abierto.
    try { await onGuardar(r.patch) } catch { /* ya avisó el toast */ }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="sm:max-w-[440px] max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none">
        <form onSubmit={enviar} noValidate className="grid gap-3">
          <DialogHeader>
            <DialogTitle>Editar gasto — {gasto.expense_name}</DialogTitle>
            <DialogDescription>{ETIQUETA_DE_TIPO[gasto.expense_type]}{pendiente ? ' · Pendiente' : ''}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <Campo htmlFor="editar-monto" label="Monto (€) *">
              <Input id="editar-monto" autoFocus inputMode="decimal" placeholder="0,00" value={entrada.monto} onChange={ev => poner('monto', ev.target.value)} />
            </Campo>
            <Campo htmlFor="editar-fecha" label={pendiente ? 'Fecha esperada *' : 'Fecha de pago *'}>
              <Input id="editar-fecha" type="date" value={entrada.fecha} onChange={ev => poner('fecha', ev.target.value)} />
            </Campo>
          </div>
          {fijo && (
            <Campo htmlFor="editar-periodo" label="Período que cubre *">
              <Input id="editar-periodo" type="month" value={entrada.period} onChange={ev => poner('period', ev.target.value)} />
            </Campo>
          )}
          {!pendiente && (
            <Campo htmlFor="editar-pagador" label="Pagó *">
              <PagadorPicker id="editar-pagador" pagadores={pagadores} valor={entrada.pagadoPor} onChange={v => poner('pagadoPor', v)} />
            </Campo>
          )}
          {!fijo && (
            <Campo htmlFor="editar-notas" label="Notas">
              <Textarea id="editar-notas" placeholder="Opcional" value={entrada.notas} onChange={ev => poner('notas', ev.target.value)} />
            </Campo>
          )}
          <p role="alert" className="min-h-4 text-xs text-danger">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
