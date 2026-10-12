import { useState } from 'react'
import { CalendarPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { TaskDueDatePicker } from '@/components/tasks/TaskDueDatePicker'
import { fmtDueLabel, localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import { opcionesDeVencimiento } from '../lib/vencimientos'
import { actualizarTarea, crearTarea } from '../service/crm.service'
import type { CrmTask, LeadDetalle } from '../types'
import { VentanaFlotante } from './VentanaFlotante'

/* Las tareas del lead, compactas, en la columna del perfil. Fue una pestaña entera
   (LeadTasksPanel) con grupos Vencidas / Hoy / Próximas; al sacar las pestañas la lista se
   lee de un vistazo al lado de la actividad, así que los grupos se volvieron el orden: por
   vencimiento, que deja lo vencido arriba y lo que no tiene fecha al final. La fecha en rojo
   dice cuál ya pasó. */

/** Cuándo vence: la fecha es la mitad de por qué la tarea importa. */
function rotuloVencimiento(t: CrmTask, today: string) {
  if (t.due_date == null) return 'Sin fecha'
  if (t.due_date < today) return `Vencía ${fmtDueLabel(t.due_date, today)}`
  return fmtDueLabel(t.due_date, today)
}

/* Sin fecha al final: no tienen con qué ordenarse contra las que sí la tienen, y ponerlas
   primero las haría parecer más urgentes que una de mañana. */
const porVencimiento = (a: CrmTask, b: CrmTask) =>
  (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')

const CHIP = 'inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors'
const CHIP_ON = 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
const CHIP_OFF = 'text-(--fg-2) bg-card [border:1px_solid_var(--line)]'

/** Los vencimientos que se usan de verdad (`opcionesDeVencimiento`), en pastillas, más «Personalizado». Los usan la hoja de
 *  nueva tarea y el compositor de la actividad: una fecha elegida se ve igual en los dos. */
export function ChipsDeVencimiento({ value, onChange, compacto = false }: {
  value: string | null
  onChange: (v: string | null) => void
  compacto?: boolean
}) {
  const today = localTodayIso()
  const rapidos = opcionesDeVencimiento(today)
  const aMano = value != null && !rapidos.some(d => d.value === value)
  const tamaño = compacto ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3 text-[13.5px]'
  return (
    <>
      {rapidos.map(d => {
        const on = value === d.value
        return (
          <button key={d.label} type="button" aria-pressed={on} onClick={() => onChange(on ? null : d.value)}
            className={cn(CHIP, tamaño, on ? CHIP_ON : CHIP_OFF)}>
            {d.label}
          </button>
        )
      })}
      <TaskDueDatePicker value={value} onSelect={onChange} align="end">
        <button type="button"
          className={cn(CHIP, tamaño, 'gap-1.5', aMano ? CHIP_ON : 'text-(--fg-2) bg-card [border:1px_dashed_var(--line-strong)]')}>
          <Icon icon={CalendarPlus} size={compacto ? 'xs' : 'sm'} />
          {aMano ? fmtDueLabel(value!, today) : 'Personalizado'}
        </button>
      </TaskDueDatePicker>
    </>
  )
}

/** Crear tarea en la ventana flotante (`VentanaFlotante`): se escribe mirando el lead. Enter crea. */
function NewTaskSheet({ open, onOpenChange, onCreate, isPending }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (title: string, dueDate: string | null) => void
  isPending: boolean
}) {
  const today = localTodayIso()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(today)
  const reset = () => { setTitle(''); setDueDate(today) }
  const cerrar = (next: boolean) => { onOpenChange(next); if (!next) reset() }
  const listo = title.trim() !== '' && !isPending

  return (
    <VentanaFlotante open={open} onOpenChange={cerrar} titulo="Nueva tarea" descripcion="Qué hay que hacer y para cuándo.">
      <form className="flex flex-col gap-4 p-4"
        onSubmit={e => { e.preventDefault(); if (!listo) return; onCreate(title.trim(), dueDate); cerrar(false) }}>
        <Input autoFocus aria-label="Qué hay que hacer" placeholder="Qué hay que hacer…" value={title}
          onChange={e => setTitle(e.target.value)} className="h-10 text-[14px] md:text-[14px]" />
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium text-(--fg-2)">Vence</span>
          <div className="flex flex-wrap gap-1.5">
            <ChipsDeVencimiento value={dueDate} onChange={setDueDate} compacto />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
          <Button type="submit" disabled={!listo}>Crear tarea</Button>
        </div>
      </form>
    </VentanaFlotante>
  )
}

function FilaTarea({ task, today, onToggle, disabled }: {
  task: CrmTask; today: string; onToggle: (t: CrmTask) => void; disabled: boolean
}) {
  const vencida = !task.completed && task.due_date != null && task.due_date < today
  return (
    <li className="flex items-start gap-2 py-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? `Reabrir "${task.title}"` : `Marcar "${task.title}" como hecha`}
        onClick={() => onToggle(task)}
        disabled={disabled}
        className={cn(
          'mt-px flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[5px] transition-colors disabled:cursor-default',
          task.completed ? 'bg-primary text-primary-foreground [border:1.5px_solid_var(--brand)]' : 'bg-card [border:1.5px_solid_var(--line-strong)]',
        )}
      >
        {task.completed && (
          <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 13 5 5L20 7" />
          </svg>
        )}
      </button>
      <span className={cn('min-w-0 flex-1 text-[13px] leading-snug text-foreground', task.completed && 'text-(--fg-muted) line-through')}>
        {task.title}
      </span>
      <span className={cn('shrink-0 text-[11.5px] font-medium tabular-nums leading-snug',
        vencida ? '[color:var(--danger-strong)]' : 'text-(--fg-muted)')}>
        {rotuloVencimiento(task, today)}
      </span>
    </li>
  )
}

/* Llegan del detalle del lead (una sola consulta al abrir), no de una consulta propia. La hoja de
   nueva tarea se controla desde afuera: también la abre el «+ Tarea» del encabezado. */
export function TareasDelLead({ leadId, responsableId, puedeEscribir, tareas, cargando, creando, onCreando }: {
  leadId: string
  /** Una tarea nueva es del responsable del lead, no de quien la anota: es su trabajo. */
  responsableId: string
  puedeEscribir: boolean
  tareas: CrmTask[]
  cargando: boolean
  creando: boolean
  onCreando: (abierto: boolean) => void
}) {
  const today = localTodayIso()

  const agregar = useMutacionDelDetalle(leadId, (v: { title: string; dueDate: string | null }) =>
    crearTarea({ lead_id: leadId, title: v.title, due_date: v.dueDate, assigned_to: responsableId }), { exito: 'Tarea creada' })
  const alternar = useMutacionDelDetalle(leadId,
    (t: CrmTask) => actualizarTarea(t.id, { completed: !t.completed, completed_at: t.completed ? null : new Date().toISOString() }),
    { optimista: (d: LeadDetalle, t: CrmTask) => ({ ...d, tasks: d.tasks.map(x => x.id === t.id ? { ...x, completed: !t.completed } : x) }) },
  )

  const pendientes = tareas.filter(t => !t.completed).sort(porVencimiento)
  const alternarTarea = (t: CrmTask) => alternar.mutate(t)

  return (
    <div className="flex flex-col">
      {cargando ? (
        <p className="py-1 text-[12.5px] text-(--fg-muted)">Cargando tareas…</p>
      ) : pendientes.length === 0 ? (
        /* Vacío, el hueco entero es la puerta: tocar «Nada pendiente» o cerca abre la nueva tarea. */
        puedeEscribir ? (
          <button type="button" onClick={() => onCreando(true)}
            className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg px-3 py-3 text-center transition-colors [border:1px_dashed_var(--line-strong)] hover:bg-(--brand-soft) hover:[border-color:var(--brand-100)]">
            <span className="text-[12.5px] text-(--fg-muted)">Nada pendiente.</span>
            <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-(--brand-soft-fg)">
              <Icon icon={Plus} size="xs" />
              Añadir tarea
            </span>
          </button>
        ) : (
          <p className="py-1 text-[12.5px] text-(--fg-muted)">Nada pendiente.</p>
        )
      ) : (
        <ul className="flex flex-col">
          {pendientes.map(t => <FilaTarea key={t.id} task={t} today={today} onToggle={alternarTarea} disabled={!puedeEscribir} />)}
        </ul>
      )}

      {/* Las completadas no se dibujan: el perfil dice lo que falta hacer, y lo hecho tachado
          era ruido al lado. Fueron un desplegable y después una lista tachada; las dos se fueron
          por pedido. Que se agendó cada una lo sigue diciendo la actividad. */}

      {/* Con tareas en la lista, un botón de verdad (con marco) y no un enlace: fue texto azul
          suelto y no se leía como algo que se toca. Vacía, el botón es el hueco de arriba. */}
      {puedeEscribir && pendientes.length > 0 && !cargando && (
        <Button type="button" variant="outline" size="sm" onClick={() => onCreando(true)} className="mt-2 w-fit">
          <Icon icon={Plus} size="xs" />
          Añadir tarea
        </Button>
      )}

      <NewTaskSheet open={creando} onOpenChange={onCreando} isPending={agregar.isPending}
        onCreate={(title, dueDate) => agregar.mutate({ title, dueDate })} />
    </div>
  )
}
