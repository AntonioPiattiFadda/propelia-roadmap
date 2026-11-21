import { PlusIcon } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Icon } from '@/components/ui/icon'
import { todayLocal } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { TablesInsert } from '@/types/database.types'
import { etiquetasVivas, mismoNombre } from '../lib/etiquetas'
import { fechaDeFilaRapida, insertDeFilaRapida, prepararFilaRapida } from '../lib/filaRapida'
import type { ValoresEtiqueta } from '../lib/formularios'
import { montoAInput } from '../lib/monto'
import type { Etiqueta, Gasto, Pagador, TipoGasto } from '../types'

const AMBOS = 'ambos'
const CAMPO ='h-6 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[13px] placeholder:text-(--fg-faint) hover:border-border focus:border-(--brand-500) focus:bg-white focus:outline-none disabled:opacity-50'

/**
 * La fila vacía al final de un bloque de la vista por mes: se escribe y Enter la carga, como en una
 * planilla, sin abrir «Nuevo gasto». El tipo lo pone el bloque. El concepto sugiere las etiquetas
 * del tipo (`datalist`) y, si no existe, se crea sola. Siempre sale pagado, por quien se elija en
 * «Pagó» (arranca vacío y en rojo). Las reglas son de `lib/filaRapida.ts`; los errores, un toast.
 */
export function FilaRapida({ tipo, period, etiquetas, gastos, pagadores, onCrearEtiqueta, onCrearGasto }: {
  tipo: TipoGasto
  period: string
  etiquetas: Etiqueta[]
  gastos: Gasto[]
  pagadores: Pagador[]
  onCrearEtiqueta: (valores: ValoresEtiqueta) => Promise<Etiqueta>
  onCrearGasto: (insert: TablesInsert<'expenses'>) => Promise<unknown>
}) {
  const fijo = tipo === 'FIXED'
  const listaId = useId()
  const conceptoRef = useRef<HTMLInputElement>(null)
  const [fecha, setFecha] = useState(() => fechaDeFilaRapida(period, todayLocal()))
  const [texto, setTexto] = useState('')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')
  // Arranca sin nadie (21/11/2026, por pedido): vacío se pinta en rojo hasta elegirlo.
  // El valor del desplegable: un id de `users`, AMBOS o vacío.
  const [quien, setQuien] = useState('')
  const activos = pagadores.filter(p => p.activo)
  const ambos = quien === AMBOS
  // Con «Ambos», `paid_by` lleva a cualquiera de los dos (la base exige uno) y la marca reparte.
  const pagadoPor = ambos ? (activos[0]?.id ?? null) : quien || null
  const [guardando, setGuardando] = useState(false)
  const opciones = etiquetasVivas(etiquetas, tipo)

  const escribirConcepto = (t: string) => {
    setTexto(t)
    // Elegir una etiqueta fija con monto habitual lo trae, si todavía no se escribió otro.
    const exacta = opciones.find(e => mismoNombre(e.name, t))
    if (exacta?.default_amount != null && !monto) setMonto(montoAInput(exacta.default_amount))
  }

  const vaciar = () => { setTexto(''); setMonto(''); setNotas('') }

  const guardar = async () => {
    if (guardando) return
    // Sin nada escrito, Enter no es un error: no hay nada que cargar.
    if (!texto.trim() && !monto.trim()) return
    const entrada = { tipo, period, texto, monto, fecha, notas, pagadoPor, ambos }
    const r = prepararFilaRapida(entrada, etiquetas, gastos)
    if ('error' in r) return void toast.error(r.error)
    setGuardando(true)
    try {
      let insert = 'insert' in r ? r.insert : null
      if ('crear' in r) {
        const creada = await onCrearEtiqueta(r.crear)
        const conEtiqueta = insertDeFilaRapida(creada, entrada, gastos)
        if ('error' in conEtiqueta) return void toast.error(conEtiqueta.error)
        insert = conEtiqueta.insert
      }
      if (!insert) return
      await onCrearGasto(insert)
      vaciar()
      // Queda lista para el siguiente, como bajar a la fila de abajo en una planilla.
      setTimeout(() => conceptoRef.current?.focus(), 0)
    } catch {
      /* ya avisó el toast de la mutación; lo escrito queda para reintentar */
    } finally {
      setGuardando(false)
    }
  }

  const teclado = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') { ev.preventDefault(); void guardar() }
    if (ev.key === 'Escape') { vaciar(); ev.currentTarget.blur() }
  }

  const etiquetaDelBloque = fijo ? 'fijo' : 'variable'
  return (
    <tr className={cn('border-t border-dashed border-(--line-soft) bg-(--surface-2)/40', fijo && 'border-l-2 border-l-(--brand-200)')}>
      <td className="px-1 py-0.5">
        <input type="date" value={fecha} disabled={guardando} onChange={ev => setFecha(ev.target.value)} onKeyDown={teclado}
          aria-label={`Fecha del gasto ${etiquetaDelBloque} nuevo`} className={cn(CAMPO, 'px-0.5 text-[11px] tabular-nums')} />
      </td>
      <td className="px-1 py-0.5">
        <input ref={conceptoRef} list={listaId} value={texto} disabled={guardando} onChange={ev => escribirConcepto(ev.target.value)} onKeyDown={teclado}
          placeholder={`+ Concepto ${etiquetaDelBloque}…`} aria-label={`Concepto del gasto ${etiquetaDelBloque} nuevo`} autoComplete="off" className={cn(CAMPO, 'font-medium')} />
        <datalist id={listaId}>{opciones.map(e => <option key={e.id} value={e.name} />)}</datalist>
      </td>
      <td className="px-1 py-0.5">
        {/* La columna de «Pagó X»: un desplegable, en rojo mientras no se eligió a nadie. Un fijo
            no lleva nota (como en el alta); un variable la escribe al lado. */}
        <div className="flex items-center gap-1">
          <select
            value={quien} disabled={guardando} onChange={ev => setQuien(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); void guardar() } }}
            aria-label={`Quién pagó el gasto ${etiquetaDelBloque} nuevo`} aria-invalid={!pagadoPor}
            className={cn(
              CAMPO, 'w-auto max-w-[9rem] shrink-0 cursor-pointer border-border bg-white',
              !pagadoPor && 'border-danger/60 bg-danger/5 font-semibold text-danger',
            )}
          >
            <option value="">Pagó…</option>
            {activos.map(p => <option key={p.id} value={p.id}>Pagó {p.nombre}</option>)}
            {activos.length > 1 && <option value={AMBOS}>Pagaron ambos</option>}
          </select>
          {!fijo && (
            <input value={notas} disabled={guardando} onChange={ev => setNotas(ev.target.value)} onKeyDown={teclado}
              placeholder="Nota (opcional)" aria-label="Nota del gasto variable nuevo" className={cn(CAMPO, 'text-(--fg-muted) max-md:hidden')} />
          )}
        </div>
      </td>
      <td className="px-1 py-0.5">
        <input inputMode="decimal" value={monto} disabled={guardando} onChange={ev => setMonto(ev.target.value)} onKeyDown={teclado}
          placeholder="0,00 €" aria-label={`Monto del gasto ${etiquetaDelBloque} nuevo`} className={cn(CAMPO, 'text-right tabular-nums')} />
      </td>
      <td className="px-1 py-0.5">
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={() => void guardar()} disabled={guardando}
            title="Cargar (Enter)" aria-label={`Cargar el gasto ${etiquetaDelBloque}`}
            className="grid size-5 cursor-pointer place-items-center rounded border border-(--brand-200) bg-(--brand-soft) text-(--brand-700) hover:bg-white disabled:opacity-50">
            <Icon icon={PlusIcon} size="xs" />
          </button>
        </div>
      </td>
    </tr>
  )
}
