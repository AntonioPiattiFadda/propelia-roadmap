import { PencilIcon, XIcon } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { parseCalendarDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { eur } from '../lib/monto'
import { tituloDePeriodo } from '../lib/periodos'
import { mesesDeLaCaja, totalesPorPagador } from '../lib/porMes'
import type { Etiqueta, FilaCaja, Gasto, Pagador } from '../types'

const claveDe = (f: FilaCaja) => f.gasto?.id ?? `${f.etiqueta?.id}:${f.period}`
// Con todos los meses juntos, la fecha lleva el año: «05/10» sola no dice de cuál es.
const fechaCorta = (d: string) => parseCalendarDay(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Lo que pagó cada uno, una tarjeta por persona. Va en la columna de la izquierda de la vista. */
export function ResumenPorPagador({ filas, pagadores, cargando, className }: {
  filas: FilaCaja[]
  pagadores: Pagador[]
  cargando: boolean
  className?: string
}) {
  // Mientras cargan los gastos no hay cifras honestas, igual que en ResumenCaja.
  if (cargando) return <Skeleton className={cn('h-20 w-full', className)} />
  const porPagador = totalesPorPagador(filas, pagadores)
  if (!porPagador.length) return null
  return (
    <div className={cn('grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3', className)}>
      {porPagador.map(t => (
        <div key={t.pagador?.id ?? 'otro'} className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-(--fg-2)">
            <AvatarUsuario usuario={t.pagador} titulo={t.pagador?.nombre ?? 'Otro'} className="size-6 text-[10px]" />
            Resumen de gastos de {t.pagador?.nombre ?? 'otros'}
          </div>
          <div className="mt-1.5 text-xl font-semibold tabular-nums">{eur(t.total)}</div>
          <div className="mt-0.5 text-xs tabular-nums text-(--fg-muted)">
            {eur(t.fijos)} fijos · {eur(t.variables)} variables · {t.n} {t.n === 1 ? 'gasto' : 'gastos'}
          </div>
        </div>
      ))}
    </div>
  )
}

/* La Caja como una planilla: un bloque por mes, del más viejo al más nuevo, para leer la cronología
   (por pedido, 25/10/2026; hubo unas horas un solo bloque sin cortar por mes y no se entendía de qué
   mes era cada gasto). Adentro, los fijos mensuales arriba y los variables abajo, renglones bajos
   para ver mucho sin scrollear. El resumen por persona es aparte (`ResumenPorPagador`). */
export function CajaPorMes({ filas, pagadores, cargando, error, onPagar, onEditar, onEditarEtiqueta, onBorrar }: {
  filas: FilaCaja[]
  pagadores: Pagador[]
  cargando: boolean
  error: boolean
  onPagar: (fila: FilaCaja) => void
  onEditar: (gasto: Gasto) => void
  onEditarEtiqueta: (etiqueta: Etiqueta) => void
  onBorrar: (gastoId: string) => void
}) {
  const acciones = { onPagar, onEditar, onEditarEtiqueta, onBorrar }
  if (error) {
    return <p role="alert" className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-danger">No se pudieron cargar los gastos. Probá de nuevo.</p>
  }
  if (cargando) {
    return <div className="flex flex-col gap-1" aria-busy>{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-6 w-full" />)}</div>
  }
  if (!filas.length) {
    return <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-(--fg-muted)">No hay gastos en este período.</p>
  }

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      {mesesDeLaCaja(filas, pagadores).map(mes => (
        <section key={mes.period} className="overflow-hidden rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between bg-foreground px-3 py-1.5 font-semibold text-background">
            <span className="first-letter:uppercase">{tituloDePeriodo(mes.period)}</span>
            <span className="tabular-nums">{eur(mes.total)}</span>
          </header>
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[76px]" /><col /><col className="max-md:hidden md:w-[40%]" /><col className="w-[96px]" /><col className="w-[84px]" />
            </colgroup>
            <tbody>
              {mes.fijos.length > 0 && (
                <Grupo titulo="Fijos mensuales" total={mes.totalFijos} fijo>
                  {mes.fijos.map(f => <Renglon key={claveDe(f)} fila={f} fijo {...acciones} />)}
                </Grupo>
              )}
              {mes.variables.length > 0 && (
                <Grupo titulo="Variables" total={mes.totalVariables}>
                  {mes.variables.map(f => <Renglon key={claveDe(f)} fila={f} {...acciones} />)}
                </Grupo>
              )}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

function Grupo({ titulo, total, fijo = false, children }: { titulo: string; total: number; fijo?: boolean; children: React.ReactNode }) {
  return (
    <>
      <tr className={cn('border-t border-border text-xs font-semibold uppercase tracking-wide', fijo ? 'bg-(--brand-soft) text-(--brand-700)' : 'bg-(--surface-2) text-(--fg-2)')}>
        <td colSpan={3} className="px-3 py-1">{titulo}</td>
        <td className="px-2 py-1 text-right tabular-nums">{eur(total)}</td>
        <td />
      </tr>
      {children}
    </>
  )
}

function Renglon({ fila: f, fijo = false, onPagar, onEditar, onEditarEtiqueta, onBorrar }: {
  fila: FilaCaja
  fijo?: boolean
  onPagar: (fila: FilaCaja) => void
  onEditar: (gasto: Gasto) => void
  onEditarEtiqueta: (etiqueta: Etiqueta) => void
  onBorrar: (gastoId: string) => void
}) {
  const pagado = f.status === 'PAID'
  return (
    <tr className={cn('group border-t border-(--line-soft) hover:bg-(--surface-2)', fijo && 'border-l-2 border-l-(--brand-500)')}>
      <td className="px-3 py-1 tabular-nums text-(--fg-muted)">{fechaCorta(f.fecha)}</td>
      <td className="truncate px-2 py-1 font-medium" title={f.nombre}>{f.nombre}</td>
      <td className="truncate px-2 py-1 text-(--fg-muted) max-md:hidden" title={f.sub}>{f.sub}</td>
      <td
        className={cn('px-2 py-1 text-right tabular-nums', pagado ? 'font-semibold' : 'text-[#8A5A0B]')}
        title={pagado ? undefined : f.status === 'NONE' ? 'Pendiente · monto habitual de la etiqueta' : 'Pendiente'}
      >
        {eur(f.amount)}
      </td>
      <td className="px-1 py-0.5 text-right">
        <div className="flex items-center justify-end gap-0.5">
          {!pagado && (
            <button type="button" onClick={() => onPagar(f)}
              className="h-5 cursor-pointer rounded border border-(--brand-200) bg-(--brand-soft) px-1.5 text-[11px] font-semibold text-(--brand-700) hover:bg-white">
              Pagar
            </button>
          )}
          {/* Un fijo pendiente no tiene gasto: lo que se edita es su etiqueta (monto habitual, vencimiento). */}
          {(f.gasto || f.etiqueta) && (
            <button type="button" title={f.gasto ? 'Editar' : 'Editar etiqueta'} aria-label={`Editar ${f.nombre}`}
              onClick={() => (f.gasto ? onEditar(f.gasto) : onEditarEtiqueta(f.etiqueta!))}
              className="grid size-5 cursor-pointer place-items-center rounded text-(--fg-faint) hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
              <Icon icon={PencilIcon} size="xs" />
            </button>
          )}
          {f.gasto && (
            <button type="button" title="Borrar" aria-label={`Borrar ${f.nombre}`} onClick={() => onBorrar(f.gasto!.id)}
              className="grid size-5 cursor-pointer place-items-center rounded text-(--fg-faint) hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
              <Icon icon={XIcon} size="xs" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
