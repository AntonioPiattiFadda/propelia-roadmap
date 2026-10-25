import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CampoDecisor } from '../lib/clientData'
import type { CrmStage } from '../types'
import { OpcionesDeEtapa } from './leadCells'

/* Los renglones del registro de actividad que comparten la llamada y la demo (23/10/2026, por
   pedido: «mismo orden y diseño, para no marear»). Solo pintan: el estado y las reglas son de quien
   los usa (`ActividadLead` y `useRegistroDeDemo`). Con una copia por formulario, el arreglo que se
   hace en uno no llega nunca al otro. */

export const pastilla = (on: boolean) => cn(
  'inline-flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors',
  on ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)

/** El «+» discreto que abre el campo para escribir a mano. */
export const botonEscribir = 'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--fg-faint) transition-colors hover:bg-(--surface-2) hover:text-(--fg-2)'

/** El campo de una línea para escribir a mano (con quién, el número, el decisor). */
export const campoEscrito = 'h-7 min-w-[150px] flex-1 rounded-md bg-card px-2.5 text-[12.5px] text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]'

/** El texto del registro, en rojo si falta. */
export const claseDelTexto = (rojo: boolean) => cn(
  'block max-h-[50vh] min-h-9 w-full resize-y rounded-md bg-card px-3 py-2 text-[13.5px] leading-5 text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]',
  rojo && '[border-color:var(--danger)] bg-(--danger-soft)')

/** Un renglón que falta se marca entero en rojo, y su rótulo también. */
export const filaEnRojo = (rojo: boolean) => rojo && 'rounded-md bg-(--danger-soft) px-2 py-1 [outline:1px_solid_var(--danger)]'
export const rotuloEnRojo = (rojo: boolean) => rojo ? 'font-semibold text-(--danger)' : 'text-(--fg-muted)'

/* Con quién (en la llamada «Hablaste con», en la demo «Quién asiste»): una pastilla por contacto,
   que se prenden varias; los escritos a mano se sacan con su ✕ y el «+» abre el campo. Doble clic
   en un contacto abre su ficha (20/10/2026): los dos clics prenden y apagan la pastilla, así que la
   elección queda como estaba. */
export function FilaDePersonas({
  rotulo, contactos, nuevos, con, onAlternar, onSacar, onAgregar, campoDe, onAbrirContacto, rojo, tituloNuevo, ariaEscribir,
}: {
  rotulo: string
  contactos: string[]
  nuevos: string[]
  con: string[]
  onAlternar: (nombre: string) => void
  onSacar: (nombre: string) => void
  /** Lo tipeado, sin limpiar: quien lo recibe decide si es uno nuevo o uno que ya estaba. */
  onAgregar: (escrito: string) => void
  campoDe: (nombre: string) => CampoDecisor | undefined
  onAbrirContacto?: (campo: CampoDecisor) => void
  rojo: boolean
  tituloNuevo: string
  ariaEscribir: string
}) {
  const [escribiendo, setEscribiendo] = useState(false)
  const [escrito, setEscrito] = useState('')
  const agregar = () => { setEscribiendo(false); onAgregar(escrito); setEscrito('') }
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', filaEnRojo(rojo))}>
      <span className={cn('mr-0.5 text-[11.5px]', rotuloEnRojo(rojo))}>{rotulo}</span>
      {contactos.map(c => {
        const on = con.includes(c)
        const campo = campoDe(c)
        return (
          <button key={c} type="button" aria-pressed={on}
            title={campo && onAbrirContacto ? 'Doble clic: abrir la ficha' : undefined}
            onDoubleClick={() => { if (campo) onAbrirContacto?.(campo) }}
            onClick={() => onAlternar(c)}
            className={pastilla(on)}>
            <span className="truncate">{c}</span>
          </button>
        )
      })}
      {/* Los escritos a mano se eligen como cualquier otro y se sacan con su ✕ (ver el teléfono
          escrito: el «+» que llevaban se apretaba creyendo que agregaba). */}
      {nuevos.map(c => {
        const on = con.includes(c)
        return (
          <span key={`nuevo-${c}`} className={cn(pastilla(on), 'pr-1')}>
            <button type="button" aria-pressed={on} title={tituloNuevo}
              onClick={() => onAlternar(c)} className="min-w-0 cursor-pointer truncate">
              {c}
            </button>
            <button type="button" aria-label={`Sacar a ${c}`} title="Sacar" onClick={() => onSacar(c)}
              className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-(--surface-2)">
              <X size={12} />
            </button>
          </span>
        )
      })}
      {escribiendo ? (
        <input autoFocus value={escrito} onChange={e => setEscrito(e.target.value)} onBlur={agregar}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); agregar() }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEscrito(''); setEscribiendo(false) }
          }}
          aria-label={ariaEscribir} placeholder="Escribí el nombre…" className={campoEscrito} />
      ) : (
        <button type="button" onClick={() => setEscribiendo(true)} className={botonEscribir}
          title="Escribir otro nombre" aria-label="Escribir otro nombre">
          <Icon icon={Plus} size="xs" />
        </button>
      )}
    </div>
  )
}

/* «¿Es decisor?»: se pregunta solo mientras el perfil no lo sepa (`decisorSabido`); si lo sabe,
   lo dice en una línea (`NotaDeDecisorSabido`). */
export function FilaEsDecisor({ valor, onCambiar, rojo, title }: {
  valor: boolean | null; onCambiar: (v: boolean) => void; rojo: boolean; title: string
}) {
  return (
    <div role="radiogroup" aria-label="¿Es decisor?" className={cn('flex flex-wrap items-center gap-1.5', filaEnRojo(rojo))}>
      <span className={cn('mr-0.5 text-[11.5px]', rotuloEnRojo(rojo))}>¿Es decisor?</span>
      {([[true, 'Sí'], [false, 'No']] as const).map(([v, label]) => (
        <button key={label} type="button" role="radio" aria-checked={valor === v}
          onClick={() => onCambiar(v)} title={title}
          className={pastilla(valor === v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function NotaDeDecisorSabido({ sabido }: { sabido: boolean }) {
  return (
    <p className="text-[11.5px] text-(--fg-muted)">
      {sabido ? 'Figura como decisor en el perfil.' : 'Figura como no decisor en el perfil.'}
    </p>
  )
}

/* El decisor apuntado (17/10/2026): el nombre que dio el doorkeeper. Va debajo del texto. */
export function CampoDecisorApuntado({ id, valor, onCambiar, title }: { id: string; valor: string; onCambiar: (v: string) => void; title: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label htmlFor={id} className="mr-0.5 text-[11.5px] text-(--fg-muted)">Decisor</label>
      <input id={id} value={valor} onChange={e => onCambiar(e.target.value)}
        placeholder="Nombre de quien decide, si te lo dijeron (opcional)" title={title}
        className={cn(campoEscrito, 'min-w-[220px]')} />
    </div>
  )
}

/* «El lead queda en»: arranca vacía y es obligatoria (12/10/2026). */
export function CajaDeEtapa({ valor, onCambiar, opciones, actual, rojo, aviso }: {
  valor: string
  onCambiar: (id: string) => void
  opciones: CrmStage[]
  actual: CrmStage | undefined
  rojo: boolean
  aviso: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-md px-3 py-2',
      rojo ? 'bg-(--danger-soft) [border:1px_solid_var(--danger)]' : 'bg-(--surface-2) [border:1px_solid_var(--line-soft)]')}>
      <span className={cn('text-[12.5px] font-semibold', rojo ? 'text-(--danger)' : 'text-foreground')}>El lead queda en</span>
      <Select value={valor} onValueChange={onCambiar}>
        <SelectTrigger aria-label="Etapa en la que queda el lead" aria-invalid={rojo}
          className={cn('h-8 w-auto min-w-[220px] bg-card text-[12.5px]', rojo && '[border-color:var(--danger)]')}>
          <SelectValue placeholder="Elegí una etapa" />
        </SelectTrigger>
        <SelectContent>
          <OpcionesDeEtapa etapas={opciones} />
        </SelectContent>
      </Select>
      {rojo
        ? <span role="alert" className="text-[11.5px] font-semibold text-(--danger)">{aviso}</span>
        : <span className="text-[11.5px] text-(--fg-muted)">Hoy está en «{actual?.label ?? 'sin etapa'}»</span>}
    </div>
  )
}
