import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSemanaDeAgenda, weekTitle } from '../hooks/useSemanaDeAgenda'
import { fechaParaAbrir } from '../lib/selectorDeHorario'
import { HoraDeEspana } from './BanderaEspana'
import { WeekGrid } from './WeekGrid'

export type HorarioElegido = { ymd: string; startTime: string; endTime: string }

/* «Seleccionar día y hora» (23/10/2026, por pedido): la semana de la Agenda en una ventana encima de
   todo, para elegir el horario de una reunión sin irse del formulario (la demo se agenda en la
   ventana de «Registrar actividad» del CRM). Tocar un hueco devuelve ese horario y cierra; tocar
   una reunión no hace nada. Se monta solo mientras está abierta, así cada vez nace en la semana
   del día ya elegido (o en la de hoy).
   Va con Radix directo y no con `DialogContent` (copia del producto, centrado y de ancho fijo). Va
   en z 400: por encima de la ventana flotante (z 50), del popover de la Agenda (z 250) y de los
   menús (z 300). No lleva `.ui-scale`: está portaleada a `body` como el formulario que la abre, y
   `slotAtPointer` mide el zoom real de la columna, así que el horario sale bien con o sin él. */
export function SelectorDeHorario({ fecha, titulo = 'Elegí día y hora', horaDeEspana = false, onElegir, onCerrar }: {
  /** El día ya elegido en el formulario (`YYYY-MM-DD`), o vacío. */
  fecha: string
  titulo?: string
  /** La semana en el reloj de España (la demo, 26/10/2026): el horario que vuelve es de allá. */
  horaDeEspana?: boolean
  onElegir: (horario: HorarioElegido) => void
  onCerrar: () => void
}) {
  const isMobile = useIsMobile()
  const [referencia, setReferencia] = useState(() => fechaParaAbrir(fecha, new Date()))
  const { start, end, days, isCurrentWeek, eventsByDay } = useSemanaDeAgenda(referencia, { horaDeEspana })
  const correr = (dias: number) =>
    setReferencia(r => new Date(r.getFullYear(), r.getMonth(), r.getDate() + dias, 12))

  return (
    <DialogPrimitive.Root open onOpenChange={abierto => { if (!abierto) onCerrar() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[400] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-4 z-[400] flex flex-col overflow-hidden rounded-xl bg-card shadow-[0_12px_40px_rgba(0,0,0,0.25)] [border:1px_solid_var(--line-strong)] max-md:inset-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 [border-bottom:1px_solid_var(--line)] max-md:px-3">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-foreground">{titulo}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Tocá un horario libre de la semana para usarlo en el formulario.
            </DialogPrimitive.Description>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setReferencia(new Date())}>
                {isCurrentWeek || isMobile ? 'Hoy' : 'Ir a hoy'}
              </Button>
              <Button size="icon" variant="ghost" aria-label="Semana anterior" onClick={() => correr(-7)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Semana siguiente" onClick={() => correr(7)}>
                <ChevronRight className="size-4" />
              </Button>
              <span className="text-[14px] font-semibold capitalize">{weekTitle(start, end)}</span>
            </div>
            {horaDeEspana && (
              <HoraDeEspana className="rounded-full bg-(--surface-2) px-2.5 py-1 text-[12.5px] font-semibold text-(--fg-2)" />
            )}
            <DialogPrimitive.Close aria-label="Cerrar"
              className="ml-auto flex size-8 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-(--surface-2)">
              <XIcon size={16} />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4 max-md:p-2">
            <WeekGrid
              compact={isMobile}
              days={days}
              eventsByDay={eventsByDay}
              selectedYmd={fecha}
              horaDeEspana={horaDeEspana}
              onCreateAt={({ ymd, startTime, endTime }) => {
                onElegir({ ymd, startTime, endTime })
                onCerrar()
              }}
              onEditMeeting={() => {}}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
