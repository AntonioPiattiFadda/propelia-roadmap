import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { opcionesDeEtiqueta } from '../lib/etiquetas'
import { moverIndice } from '../lib/formularios'
import { eur } from '../lib/monto'
import type { Etiqueta, TipoGasto } from '../types'
import { PillTipo } from './PillTipo'

const metaDe = (e: Etiqueta) =>
  e.expense_type === 'FIXED'
    ? [e.default_amount != null ? eur(e.default_amount) : null, e.due_day ? `vence el ${e.due_day}` : null].filter(Boolean).join(' · ')
    : ''

/**
 * Port del BusinessExpenseNameInput de ms-frontend. Controlado por quien lo usa: el texto, la
 * etiqueta elegida y si la lista está abierta (el dialog necesita saberlo para que Escape cierre
 * la lista y no el dialog). Abre al enfocar; filtra las vivas del tipo elegido; la última opción
 * es «Crear etiqueta "X"». Salir del campo sin una etiqueta que exista lo vacía (lo decide `onSalir`).
 */
export function EtiquetaCombobox({ id, etiquetas, tipo, texto, abierto, inputRef, onAbiertoChange, onTexto, onElegir, onCrear, onSalir }: {
  id: string
  etiquetas: Etiqueta[]
  tipo: TipoGasto
  texto: string
  abierto: boolean
  inputRef?: Ref<HTMLInputElement>
  onAbiertoChange: (abierto: boolean) => void
  onTexto: (texto: string) => void
  onElegir: (etiqueta: Etiqueta) => void
  onCrear: (nombre: string) => void
  onSalir: () => void
}) {
  const [idx, setIdx] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  const { items, mostrarCrear, vacia } = opcionesDeEtiqueta(etiquetas, tipo, texto)
  // Las opciones en un solo arreglo: el índice de las flechas recorre las etiquetas y, al final, «Crear».
  const total = items.length + (mostrarCrear ? 1 : 0)
  const activo = Math.min(idx, Math.max(total - 1, 0))

  useEffect(() => {
    raiz.current?.querySelector('[data-activa="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activo, abierto])

  const elegir = (i: number) => {
    if (i < items.length) onElegir(items[i])
    else onCrear(texto.trim())
  }

  const teclado = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      if (!abierto) { onAbiertoChange(true); setIdx(0) } else setIdx(moverIndice(activo, total, ev.key))
    } else if (ev.key === 'Enter' && abierto && total) {
      ev.preventDefault() // si no, el Enter manda el formulario
      elegir(activo)
    }
    // Escape no se atiende acá: Radix lo escucha en el documento, y el dialog lo frena mirando `abierto`.
  }

  return (
    // El blur de la raíz decide «salí del campo»: las opciones usan mousedown + preventDefault para
    // que el input no pierda el foco antes del clic, y un foco que va a un hijo no cuenta como salir.
    <div
      ref={raiz}
      className="relative"
      onBlur={ev => {
        if (ev.relatedTarget instanceof Node && raiz.current?.contains(ev.relatedTarget)) return
        onAbiertoChange(false)
        onSalir()
      }}
    >
      <Input
        id={id}
        ref={inputRef}
        value={texto}
        autoComplete="off"
        placeholder="Etiqueta..."
        role="combobox"
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-activedescendant={abierto && total ? `${id}-op-${activo}` : undefined}
        aria-autocomplete="list"
        onFocus={() => { if (!abierto) { onAbiertoChange(true); setIdx(0) } }}
        onChange={ev => { onTexto(ev.target.value); onAbiertoChange(true); setIdx(0) }}
        onKeyDown={teclado}
      />
      {abierto && (
        <div id={`${id}-lista`} role="listbox" className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-md">
          {vacia && !texto.trim() ? (
            <p className="px-2 py-2.5 text-center text-xs text-(--fg-muted)">Escribí un nombre para crear tu primera etiqueta</p>
          ) : !total ? (
            <p className="px-2 py-2.5 text-center text-xs text-(--fg-muted)">Sin resultados</p>
          ) : (
            <>
              {items.length > 0 && <div className="px-1.5 py-1"><PillTipo tipo={tipo} className="px-[7px] text-[10px] uppercase tracking-wider" /></div>}
              {items.map((e, i) => (
                <button
                  key={e.id}
                  id={`${id}-op-${i}`}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={i === activo}
                  data-activa={i === activo}
                  onMouseDown={ev => { ev.preventDefault(); elegir(i) }}
                  className={cn('flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-[7px] text-left text-[13.5px] hover:bg-(--surface-3)', i === activo && 'bg-(--surface-3)')}
                >
                  <span>{e.name}</span>
                  {metaDe(e) && <span className="whitespace-nowrap text-xs tabular-nums text-(--fg-muted)">{metaDe(e)}</span>}
                </button>
              ))}
              {mostrarCrear && (
                <button
                  id={`${id}-op-${items.length}`}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={items.length === activo}
                  data-activa={items.length === activo}
                  onMouseDown={ev => { ev.preventDefault(); elegir(items.length) }}
                  className={cn('mt-1 flex w-full cursor-pointer rounded-md border-t border-(--line-soft) px-2 pb-[7px] pt-[9px] text-left text-[13.5px] font-medium text-(--brand-700) hover:bg-(--surface-3)', items.length === activo && 'bg-(--surface-3)')}
                >
                  + Crear etiqueta “{texto.trim()}”
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
