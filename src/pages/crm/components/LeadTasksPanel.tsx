import { useState } from 'react'
import { CalendarPlus, ChevronDown, Plus } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { FullscreenComposer } from '@/components/ui/fullscreen-composer'
import { TaskDueDatePicker } from '@/components/tasks/TaskDueDatePicker'
import { fmtDueLabel, localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import { actualizarTarea, crearTarea } from '../service/crm.service'
import type { CrmTask, LeadDetalle } from '../types'

type Task = CrmTask

/**
 * Las tareas del lead, agrupadas por urgencia. Es la tercera pestaña de la ficha en
 * móvil.
 *
 * En escritorio las tareas viven al pie del perfil, en la columna izquierda: ahí hay
 * dos columnas y entran a la vista sin competir con nada. En móvil no hay columna
 * izquierda —el contenido se apila— y quedaban enterradas debajo del perfil, a un
 * scroll largo de donde se las busca. Como pestaña se llega en un toque, y el contador
 * dice si hay algo pendiente sin tener que entrar.
 *
 * El orden es Vencidas → Hoy → Próximas, y lo hecho va al final plegado: a esta
 * pestaña se entra a ver lo que falta, no lo que ya se hizo.
 */

type Group = { key: string; title: string; className: string; tasks: Task[] }

function groupTasks(pending: Task[], today: string): Group[] {
  const overdue: Task[] = []
  const todayTasks: Task[] = []
  const upcoming: Task[] = []

  for (const t of pending) {
    if (t.due_date == null) upcoming.push(t)
    else if (t.due_date < today) overdue.push(t)
    else if (t.due_date === today) todayTasks.push(t)
    else upcoming.push(t)
  }

  // Sin fecha al final de "Próximas": no tienen con qué ordenarse contra las que sí la
  // tienen, y ponerlas primero las haría parecer más urgentes que una de mañana.
  const byDate = (a: Task, b: Task) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')

  return [
    { key: 'overdue', title: 'Vencidas', className: '[color:var(--danger-strong)]', tasks: overdue.sort(byDate) },
    { key: 'today', title: 'Hoy', className: 'text-primary', tasks: todayTasks },
    { key: 'upcoming', title: 'Próximas', className: 'text-(--fg-2)', tasks: upcoming.sort(byDate) },
  ].filter(g => g.tasks.length > 0)
}

/** Cuándo vence, con el color de su grupo: la fecha es la mitad de por qué la tarea importa. */
function dueLabel(task: Task, today: string) {
  if (task.due_date == null) return 'Sin fecha'
  if (task.due_date < today) return `Vencía ${fmtDueLabel(task.due_date, today)}`
  return fmtDueLabel(task.due_date, today)
}

function TaskCard({ task, today, onToggle, disabled }: {
  task: Task
  today: string
  onToggle: (task: Task) => void
  disabled: boolean
}) {
  const isOverdue = !task.completed && task.due_date != null && task.due_date < today

  return (
    <div
      className={cn(
        'flex items-start gap-[11px] rounded-xl bg-card p-3',
        isOverdue
          ? '[border:1px_solid_color-mix(in_srgb,var(--danger-strong)_28%,transparent)]'
          : '[border:1px_solid_var(--line)]',
      )}
    >
      {/* 24px y no una casilla nativa: es el objetivo que se toca para dar por hecha
          una tarea, y el nativo mide 13px en iOS. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? `Reabrir "${task.title}"` : `Marcar "${task.title}" como hecha`}
        onClick={() => onToggle(task)}
        disabled={disabled}
        className={cn(
          'mt-px flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors',
          task.completed
            ? 'bg-primary text-primary-foreground [border:1.5px_solid_var(--brand)]'
            : 'bg-card [border:1.5px_solid_var(--line-strong)]',
        )}
      >
        {task.completed && (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 13 5 5L20 7" />
          </svg>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn(
          'text-[15px] leading-snug text-foreground',
          task.completed && 'text-(--fg-muted) line-through',
        )}>
          {task.title}
        </span>
        <span className={cn(
          'text-[12.5px] font-semibold leading-snug',
          isOverdue ? '[color:var(--danger-strong)]' : 'text-(--fg-2)',
        )}>
          {dueLabel(task, today)}
        </span>
      </div>
    </div>
  )
}

/**
 * Crear tarea: pantalla completa, como el resto de la escritura en móvil.
 *
 * Era una hoja inferior, y ahí los dos campos nacían justo donde aparece el teclado: el
 * vencimiento quedaba apretado contra las teclas o directamente tapado. Con
 * `FullscreenComposer` el título, las pastillas de vencimiento y la acción quedan todos
 * en el borde de arriba, lejos del teclado.
 */
function NewTaskSheet({ open, onOpenChange, onCreate, isPending }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (title: string, dueDate: string | null) => void
  isPending: boolean
}) {
  const today = localTodayIso()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(today)

  const reset = () => {
    setTitle('')
    setDueDate(today)
  }

  // Los vencimientos que se usan de verdad, en pastillas: elegir "mañana" en un
  // calendario son tres toques y una lectura de grilla para el caso más común.
  const quickDues = [
    { label: 'Hoy', value: today },
    { label: 'Mañana', value: shiftIsoDate(today, 1) },
    { label: 'En 3 días', value: shiftIsoDate(today, 3) },
  ]
  const isCustomDue = dueDate != null && !quickDues.some(d => d.value === dueDate)

  // Más chicas que en la hoja (h-9 en vez de h-10): las cuatro pastillas comparten la
  // tira de arriba, y a la altura anterior la cuarta se caía a una segunda fila.
  const chipClass = 'inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full px-3 text-[13.5px] transition-colors'

  return (
    <FullscreenComposer
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (!next) reset()
      }}
      title="Nueva tarea"
      value={title}
      onChange={setTitle}
      onSubmit={() => {
        onCreate(title.trim(), dueDate)
        onOpenChange(false)
        reset()
      }}
      submitLabel="Crear tarea"
      placeholder="Qué hay que hacer…"
      pending={isPending}
      toolbar={
        <>
          {quickDues.map(d => {
            const on = dueDate === d.value
            return (
              <button
                key={d.label}
                type="button"
                aria-pressed={on}
                onClick={() => setDueDate(on ? null : d.value)}
                className={cn(
                  chipClass,
                  on
                    ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
                    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)]',
                )}
              >
                {d.label}
              </button>
            )
          })}
          {/* "Elegir fecha" reusa el mismo selector que el compositor de escritorio:
              una fecha elegida a mano se ve acá y en la home igual. */}
          <TaskDueDatePicker value={dueDate} onSelect={setDueDate} align="end">
            <button
              type="button"
              className={cn(
                chipClass,
                'gap-1.5',
                isCustomDue
                  ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
                  : 'text-(--fg-2) bg-card [border:1px_dashed_var(--line-strong)]',
              )}
            >
              <Icon icon={CalendarPlus} size="sm" />
              {isCustomDue ? fmtDueLabel(dueDate!, today) : 'Elegir fecha'}
            </button>
          </TaskDueDatePicker>
        </>
      }
    />
  )
}

/* Las tareas del lead, agrupadas por urgencia (Vencidas → Hoy → Próximas, lo hecho plegado al
   final). Llegan del detalle del lead (una sola consulta al abrir) y no de una consulta propia de tareas. */
export function LeadTasksPanel({ leadId, responsableId, puedeEscribir, tareas, cargando }: {
  leadId: string
  /** Una tarea nueva es del responsable del lead, no de quien la anota: es su trabajo. */
  responsableId: string
  puedeEscribir: boolean
  tareas: CrmTask[]
  cargando: boolean
}) {
  const today = localTodayIso()
  const [composerOpen, setComposerOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const agregar = useMutacionDelDetalle(leadId, (v: { title: string; dueDate: string | null }) =>
    crearTarea({ lead_id: leadId, title: v.title, due_date: v.dueDate, assigned_to: responsableId }), { exito: 'Tarea creada' })
  const alternar = useMutacionDelDetalle(leadId,
    (t: CrmTask) => actualizarTarea(t.id, { completed: !t.completed, completed_at: t.completed ? null : new Date().toISOString() }),
    { optimista: (d: LeadDetalle, t: CrmTask) => ({ ...d, tasks: d.tasks.map(x => x.id === t.id ? { ...x, completed: !t.completed } : x) }) },
  )

  const pending = tareas.filter(t => !t.completed)
  const done = tareas.filter(t => t.completed)
  const groups = groupTasks(pending, today)
  const onToggle = (t: CrmTask) => alternar.mutate(t)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-(--surface-2)">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {cargando ? (
          <p className="px-4 py-6 text-[13.5px] text-(--fg-muted)">Cargando tareas…</p>
        ) : pending.length === 0 && done.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[15.5px] font-semibold text-foreground">Sin tareas para este lead</p>
            <p className="mt-1 text-[13.5px] leading-snug text-(--fg-2)">
              Lo que haya que hacer con esta inmobiliaria se anota acá.
            </p>
          </div>
        ) : (
          <>
            {groups.map(group => (
              <section key={group.key}>
                <div className="flex items-center gap-2 px-4 pb-1.5 pt-2.5">
                  <span className={cn('text-[10.5px] font-bold uppercase leading-none tracking-[0.07em]', group.className)}>
                    {group.title}
                  </span>
                  <span className="text-[11.5px] font-semibold text-(--fg-muted)">{group.tasks.length}</span>
                </div>
                <div className="flex flex-col gap-2 px-3.5 pb-2.5">
                  {group.tasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      today={today}
                      onToggle={onToggle}
                      disabled={!puedeEscribir}
                    />
                  ))}
                </div>
              </section>
            ))}

            {done.length > 0 && (
              <section className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowDone(v => !v)}
                  aria-expanded={showDone}
                  className="flex h-11 w-full cursor-pointer items-center gap-1.5 px-4 text-[13px] font-semibold text-(--fg-2)"
                >
                  <Icon
                    icon={ChevronDown}
                    size="sm"
                    className={cn('transition-transform', !showDone && '-rotate-90')}
                  />
                  Completadas ({done.length})
                </button>
                {showDone && (
                  <div className="flex flex-col gap-2 px-3.5 pb-2.5">
                    {done.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        today={today}
                        onToggle={onToggle}
                      disabled={!puedeEscribir}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* El pie no scrollea: crear una tarea es la acción de esta pestaña, y con la
          lista larga quedaría al final de un scroll. */}
      {puedeEscribir && (
        <div className="shrink-0 bg-card px-4 pb-4 pt-2.5 [border-top:1px_solid_var(--line)]">
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl text-[16px] [border-color:var(--brand)] text-(--brand-soft-fg)"
            onClick={() => setComposerOpen(true)}
          >
            <Icon icon={Plus} size="sm" />
            Nueva tarea
          </Button>
        </div>
      )}

      <NewTaskSheet
        open={composerOpen}
        onOpenChange={setComposerOpen}
        isPending={agregar.isPending}
        onCreate={(title, dueDate) => agregar.mutate({ title, dueDate })}
      />
    </div>
  )
}
