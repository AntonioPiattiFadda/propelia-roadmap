import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatCalendarDay, parseCalendarDay, toCalendarDay, todayLocal, type CalendarDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { activePresetKey, monthStart, presetsForMode, type DatePreset } from './presets'
import type { DatesMode, DatesSelectorV2Props, DayRange } from './types'

/**
 * Vive adentro del componente a propósito: si fuera un prop que cada pantalla pasa, en
 * tres páginas diría una cosa, en dos otra, y en una se lo habrían olvidado.
 */
const SELECTOR_LABEL = 'Selector de fechas'

const MODE_LABEL: Record<DatesMode, string> = {
  single: 'Día',
  range: 'Rango',
  compare: 'Comparar',
}

/** Lunes primero, igual que el calendario de periodUtils.ts. */
const WEEKDAYS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']

const DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/** Sin año: el cartel del paso 2 vive en una columna angosta. */
const SHORT_DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }

function buildMonthGrid(monthAnchor: CalendarDay): CalendarDay[] {
  const first = monthStart(monthAnchor)
  const lead = (parseCalendarDay(first).getDay() + 6) % 7
  const gridStart = addDays(first, -lead)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

function monthTitle(monthAnchor: CalendarDay): string {
  const raw = parseCalendarDay(monthAnchor).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function DatesSelectorV2({
  activatedModes,
  value,
  onChange,
  minDate,
  maxDate,
}: DatesSelectorV2Props) {
  const [open, setOpen] = useState(false)
  /** Primer día elegido, mientras se espera el segundo click del rango. */
  const [anchor, setAnchor] = useState<CalendarDay | null>(null)
  const [navMonth, setNavMonth] = useState<CalendarDay>(() => monthStart(value.primary.from))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setAnchor(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      setAnchor(null)
    }

    document.addEventListener('click', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const today = todayLocal()
  const { mode, primary } = value
  const isSingle = mode === 'single'

  /** Lo único que sale del componente: el modo y dos fechas. Nunca el atajo elegido. */
  function emit(nextMode: DatesMode, nextPrimary: DayRange) {
    onChange({ mode: nextMode, primary: nextPrimary, compare: null })
  }

  function handleModeChange(nextMode: DatesMode) {
    if (nextMode === 'compare' || nextMode === mode) return
    setOpen(false)
    setAnchor(null)

    if (nextMode === 'single') {
      emit('single', { from: primary.from, to: primary.from })
      return
    }
    const expanded =
      primary.from === primary.to ? { from: addDays(primary.to, -6), to: primary.to } : primary
    emit(nextMode, expanded)
  }

  function toggleCalendar() {
    const next = !open
    setOpen(next)
    setAnchor(null)
    if (next) setNavMonth(monthStart(primary.from))
  }

  function handlePickDay(day: CalendarDay) {
    if (isSingle) {
      setOpen(false)
      emit('single', { from: day, to: day })
      return
    }
    if (anchor) {
      // El popover queda abierto: cerrar el rango es justo cuando querés verlo y corregirlo.
      // Un click más arranca uno nuevo, que es también por qué no hace falta un 'empezar de nuevo'.
      const ordered = anchor <= day ? { from: anchor, to: day } : { from: day, to: anchor }
      setAnchor(null)
      emit(mode, ordered)
      return
    }
    setAnchor(day)
    emit(mode, { from: day, to: day })
  }

  function handlePreset(preset: DatePreset) {
    const resolved = preset.resolve()
    setAnchor(null)
    setNavMonth(monthStart(resolved.from))
    emit(mode, resolved)
  }

  function handleGoToToday() {
    setAnchor(null)
    setNavMonth(monthStart(today))
    emit('single', { from: today, to: today })
  }

  function shiftFrom(days: number) {
    const from = addDays(primary.from, days)
    if (isSingle) {
      emit('single', { from, to: from })
      return
    }
    emit(mode, { from, to: from > primary.to ? from : primary.to })
  }

  function shiftTo(days: number) {
    const to = addDays(primary.to, days)
    emit(mode, { from: primary.from, to: to < primary.from ? primary.from : to })
  }

  function shiftMonth(months: number) {
    const d = parseCalendarDay(navMonth)
    setNavMonth(toCalendarDay(new Date(d.getFullYear(), d.getMonth() + months, 1)))
  }

  const isOnToday = isSingle && primary.from === today
  const shortcutDisabled = !isSingle || isOnToday
  const shortcutLabel = !isSingle ? 'Rango' : isOnToday ? 'Hoy' : 'Ir a hoy'

  // Corto a propósito: desde sm la columna mide 288px y el cartel no puede pasar a dos líneas.
  const stepHint = isSingle
    ? 'Elegí el día'
    : anchor
      ? `Ahora el hasta · desde ${formatCalendarDay(anchor, SHORT_DAY_FORMAT)}`
      : 'Elegí el día desde'

  const presets = presetsForMode(mode)
  const activeKey = activePresetKey(primary, mode)
  const grid = buildMonthGrid(navMonth)
  const navMonthIndex = parseCalendarDay(navMonth).getMonth()

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={SELECTOR_LABEL}
      title={SELECTOR_LABEL}
      className="relative flex w-full flex-col items-start gap-2 sm:w-auto"
    >
      <span
        data-testid="dsv2-label"
        className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
      >
        {SELECTOR_LABEL}
      </span>

      {activatedModes.length > 1 && (
        <div className="inline-flex gap-0.5 rounded-lg border border-border bg-muted p-0.5" role="group" aria-label="Modo">
          {activatedModes.map((m) => {
            const parked = m === 'compare'
            return (
              <button
                key={m}
                type="button"
                data-testid={`dsv2-mode-${m}`}
                disabled={parked}
                aria-pressed={mode === m}
                title={parked ? 'Todavía no implementado' : undefined}
                onClick={() => handleModeChange(m)}
                className={cn(
                  'inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                  mode === m ? 'bg-card text-[var(--brand-700)] shadow-xs' : 'text-muted-foreground hover:text-foreground',
                  parked && 'cursor-not-allowed opacity-45 hover:text-muted-foreground',
                )}
              >
                {MODE_LABEL[m]}
                {parked && (
                  <span className="rounded border border-border px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    pronto
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
        <button
          type="button"
          data-testid="dsv2-today-shortcut"
          disabled={shortcutDisabled}
          onClick={handleGoToToday}
          className={cn(
            // Ancho fijo: las tres etiquetas miden distinto y la fila no puede
            // saltar cada vez que cambiás de día.
            'inline-flex h-7.5 w-20 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors',
            shortcutDisabled
              ? 'cursor-not-allowed border border-border bg-muted font-medium text-muted-foreground'
              : 'cursor-pointer border border-[var(--brand-200)] bg-[var(--brand-soft)] text-[var(--brand-700)] hover:bg-card',
          )}
        >
          {shortcutLabel}
        </button>

        <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden="true" />

        <DayField
          testId="from"
          label={isSingle ? 'Fecha' : 'Desde'}
          day={primary.from}
          active={open && !anchor}
          canPrev={!minDate || primary.from > minDate}
          canNext={!maxDate || primary.from < maxDate}
          onPrev={() => shiftFrom(-1)}
          onNext={() => shiftFrom(1)}
          onOpen={toggleCalendar}
          expanded={open}
        />

        {!isSingle && (
          <DayField
            testId="to"
            label="Hasta"
            day={primary.to}
            active={open && !!anchor}
            canPrev={!minDate || primary.to > minDate}
            canNext={!maxDate || primary.to < maxDate}
            onPrev={() => shiftTo(-1)}
            onNext={() => shiftTo(1)}
            onOpen={toggleCalendar}
            expanded={open}
          />
        )}
      </div>

      {open && (
        // title="" corta la herencia del title del contenedor: sin esto, el tooltip
        // 'Selector de fechas' aparece tapando el calendario al pasar el mouse.
        //
        // Mobile: una sola columna. `w-full` se resuelve contra el root, que es el
        // ancestro posicionado y a su vez `w-full`, así que el popover mide exactamente
        // lo que la pantalla le da y desbordar es imposible por construcción.
        //
        // Antes era `w-max` con dos hijos `shrink-0` (168 + 288 = 456px) clampeado por
        // `max-w`: el `overflow-hidden` no achicaba nada, cortaba las columnas vie/sá/do
        // del calendario y las dejaba inclickeables. Ojo que el `max-w` es un arbitrary
        // value y NO escala con --ui-scale, mientras que los `w-*` sí: el clamp solo
        // queda como red de seguridad, nunca como el mecanismo principal.
        <div
          title=""
          className="absolute top-full left-0 z-30 mt-1.5 flex w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg sm:w-max sm:flex-row"
        >
          {/* Desde sm el ancho lo decide la etiqueta más larga, con un piso para que no
            quede raquítica en modo Día. Antes era `w-42` fijo: con `whitespace-nowrap`
            y el `overflow-hidden` del popover, una etiqueta un poco más larga que hoy
            se recortaba en silencio. El popover se cierra al cambiar de modo, así que
            el cambio de ancho entre Día y Rango no se ve nunca. */}
          <div className="flex w-full shrink-0 flex-col gap-px border-b border-border p-2 sm:w-auto sm:min-w-42 sm:border-r sm:border-b-0">
            <span className="px-2 pt-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Atajos
            </span>
            {/* En mobile los atajos van en una tira que scrollea al costado, no apilados:
              en modo Rango son 9, y en vertical empujarían el calendario fuera de la
              pantalla antes de que llegues a verlo. */}
            <div className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-px sm:overflow-x-visible">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  data-testid={`dsv2-preset-${preset.key}`}
                  aria-pressed={activeKey === preset.key}
                  onClick={() => handlePreset(preset)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 text-left text-[13px] whitespace-nowrap transition-colors',
                    activeKey === preset.key
                      ? 'bg-[var(--brand-soft)] font-semibold text-[var(--brand-700)]'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desde sm el ancho es fijo a propósito: si lo decide el contenido, el cartel
            del paso 2 ensancha la columna y el calendario se va abajo de los atajos.
            En mobile no hay columna al lado, así que toma el ancho que haya. */}
          <div className="w-full shrink-0 p-2.5 sm:w-72">
            <div
              data-testid="dsv2-step-hint"
              className={cn(
                'mb-2 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-xs leading-snug',
                anchor
                  ? 'border-[#e6c4a6] bg-[#fbeee3] text-[#a8501b]'
                  : 'border-[var(--brand-200)] bg-[var(--brand-soft)] text-[var(--brand-700)]',
              )}
            >
              <span
                className={cn(
                  'mt-px grid size-4.5 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white',
                  anchor ? 'bg-[#a8501b]' : 'bg-primary',
                )}
              >
                {anchor ? 2 : 1}
              </span>
              <span className="min-w-0 flex-1">{stepHint}</span>
            </div>

            <div className="mb-1.5 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => shiftMonth(-1)}
                className="grid size-6 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="text-[13px] font-semibold">{monthTitle(navMonth)}</span>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => shiftMonth(1)}
                className="grid size-6 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            <div className="grid w-full grid-cols-7 gap-px">
              {WEEKDAYS.map((d) => (
                <span key={d} className="pb-1 text-center text-[10px] text-muted-foreground">
                  {d}
                </span>
              ))}
              {grid.map((day) => {
                const outside = parseCalendarDay(day).getMonth() !== navMonthIndex
                const disabled = (!!minDate && day < minDate) || (!!maxDate && day > maxDate)
                const isStart = day === primary.from
                const isEnd = day === primary.to
                const inside = day > primary.from && day < primary.to

                return (
                  <button
                    key={day}
                    type="button"
                    data-testid={`dsv2-day-${day}`}
                    disabled={disabled}
                    onClick={() => handlePickDay(day)}
                    className={cn(
                      'relative aspect-square min-h-11 cursor-pointer rounded-md text-xs tabular-nums transition-colors sm:min-h-0',
                      outside && 'text-muted-foreground',
                      disabled && 'cursor-not-allowed opacity-30',
                      inside && 'rounded-none bg-[var(--brand-soft)]',
                      (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground',
                      isStart && !isEnd && 'rounded-r-none',
                      isEnd && !isStart && 'rounded-l-none',
                      !inside && !isStart && !isEnd && !disabled && 'hover:bg-accent',
                      day === anchor && 'ring-2 ring-[#a8501b] ring-offset-1',
                      day === today && !isStart && !isEnd && 'font-semibold text-[var(--brand-700)]',
                    )}
                  >
                    {parseCalendarDay(day).getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const STEP_BASE =
  'grid h-full w-7 shrink-0 place-items-center text-muted-foreground disabled:cursor-not-allowed disabled:opacity-30 not-disabled:cursor-pointer not-disabled:hover:bg-muted not-disabled:hover:text-foreground'

function DayField({
  testId,
  label,
  day,
  active,
  expanded,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onOpen,
}: {
  testId: string
  label: string
  day: CalendarDay
  active: boolean
  expanded: boolean
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onOpen: () => void
}) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-full items-center overflow-hidden rounded-lg border bg-card shadow-xs transition-colors sm:w-auto',
        active ? 'border-primary ring-3 ring-[var(--brand-soft)]' : 'border-border',
      )}
    >
      <span
        className={cn(
          'flex h-full shrink-0 items-center border-r border-border px-2.5 text-[10px] font-medium uppercase tracking-wider',
          active ? 'text-[var(--brand-700)]' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <button
        type="button"
        data-testid={`dsv2-${testId}-prev`}
        aria-label={`${label}: día anterior`}
        disabled={!canPrev}
        onClick={onPrev}
        className={cn(STEP_BASE, 'border-r border-border')}
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <button
        type="button"
        data-testid={`dsv2-field-${testId}`}
        aria-expanded={expanded}
        onClick={onOpen}
        // Desde sm el ancho es FIJO, no un piso: '1 de sept de 2026' y '30 de sept de
        // 2026" no miden igual, y sin esto el campo se ensancha al mover días y empuja
        // todo lo que tiene a la derecha. Dimensionado para el peor caso ('30 de sept').
        // En mobile el campo ya ocupa la fila entera, así que `flex-1` da la misma
        // estabilidad sin arriesgar un desborde a 320px.
        className="h-full flex-1 cursor-pointer px-3 text-center text-[13px] font-medium tabular-nums whitespace-nowrap hover:bg-muted sm:w-40 sm:flex-none"
      >
        {formatCalendarDay(day, DAY_FORMAT)}
      </button>
      <button
        type="button"
        data-testid={`dsv2-${testId}-next`}
        aria-label={`${label}: día siguiente`}
        disabled={!canNext}
        onClick={onNext}
        className={cn(STEP_BASE, 'border-l border-border')}
      >
        <ChevronRight className="size-3.5" />
      </button>
    </span>
  )
}
