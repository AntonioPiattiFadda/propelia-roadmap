import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { inicioDe } from '@/components/nav'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { useCrmRealtime } from '@/pages/crm/hooks/useCrmRealtime'
import { pedirPermisoDeAvisos } from '@/pages/crm/hooks/useAlarmasDeTareas'
import { enlaceAlCrm } from '@/pages/crm/lib/leadFilterParams'
import { agruparReuniones, leerDescripcionDeDemo } from '@/pages/crm/lib/reuniones'
import type { Usuario } from '@/pages/crm/types'
import { useDemos } from './hooks/useDemos'
import type { Demo } from './service/demos.service'

type Pestaña = 'proximas' | 'pasadas'

const ESTADO: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'text-primary' },
  completed: { label: 'Hecha', className: 'text-success' },
  cancelled: { label: 'Cancelada', className: 'text-(--fg-muted)' },
}
const fmtCuando = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtAgendada = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Persona({ usuario }: { usuario: Usuario | undefined }) {
  if (!usuario) return <span className="text-[12px] text-(--fg-faint)">—</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <AvatarUsuario usuario={usuario} titulo={usuario.nombre} />
      <span className="truncate">{usuario.nombre}</span>
    </span>
  )
}

function FilaDemo({ d, usuarios }: { d: Demo; usuarios: Map<string, Usuario> }) {
  const navigate = useNavigate()
  const { email, asistentes, notas } = leerDescripcionDeDemo(d.description)
  const estado = ESTADO[d.status] ?? ESTADO.scheduled
  const abrir = d.lead_id ? () => navigate(enlaceAlCrm({ lead: d.lead_id! })) : undefined
  return (
    <TableRow onClick={abrir} className={cn(abrir && 'cursor-pointer', d.status === 'cancelled' && 'opacity-60')}>
      <TableCell className="tabular-nums whitespace-nowrap">{fmtCuando.format(new Date(d.starts_at))}</TableCell>
      <TableCell className="max-w-56 truncate font-medium">{d.lead?.client?.company_name || '—'}</TableCell>
      <TableCell><Persona usuario={d.created_by ? usuarios.get(d.created_by) : undefined} /></TableCell>
      <TableCell><Persona usuario={usuarios.get(d.assigned_to)} /></TableCell>
      <TableCell className="max-w-72 text-[12.5px]">
        {email && <div className="truncate" title={email}>{email}</div>}
        {asistentes.length > 0 && <div className="truncate text-(--fg-2)" title={asistentes.join(', ')}>{asistentes.join(', ')}</div>}
        {!email && !asistentes.length && <span className="text-(--fg-faint)">—</span>}
      </TableCell>
      <TableCell className="max-w-72 text-[12.5px] text-(--fg-2)">
        <div className="line-clamp-2 whitespace-pre-line" title={notas || d.cancel_reason || undefined}>
          {d.status === 'cancelled' && d.cancel_reason ? `Motivo: ${d.cancel_reason}` : notas || '—'}
        </div>
      </TableCell>
      <TableCell className={cn('font-semibold whitespace-nowrap', estado.className)}>{estado.label}</TableCell>
      <TableCell className="tabular-nums whitespace-nowrap text-(--fg-muted)">{fmtAgendada.format(new Date(d.created_at))}</TableCell>
    </TableRow>
  )
}

/* NUEVO (20/10/2026, por pedido). Todas las demos del CRM en una tabla, solo SUPERADMIN: además del
   `roles` de `NAV` (que ya rebota en `RequireRol`), el gate va acá adentro, como en Ajustes. El
   aviso de demo nueva no vive acá sino en `AppLayout` (`useAvisosDeDemos`). Tocar un renglón abre
   el lead en el CRM. Lo de la invitación sale de `description` (`leerDescripcionDeDemo`). */
export function Demos() {
  useCrmRealtime()
  const { yo, esSuperadmin, usuarios } = useCarteras()
  const demosQ = useDemos({ enabled: esSuperadmin })
  const [pestaña, setPestaña] = useState<Pestaña>('proximas')
  const [permiso, setPermiso] = useState(() => (typeof Notification === 'undefined' ? 'denied' : Notification.permission))

  const porId = useMemo(() => new Map(usuarios.map(u => [u.id, u])), [usuarios])
  const { proximas, pasadas } = useMemo(() => agruparReuniones(demosQ.data ?? [], Date.now()), [demosQ.data])
  const filas = pestaña === 'proximas' ? proximas : pasadas

  if (!yo) return null
  if (!esSuperadmin) return <Navigate to={inicioDe(yo.rol)} replace />

  return (
    <div className="ui-scale-md flex flex-col gap-3 p-4 max-md:p-2">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">Demos</h1>
        <div role="tablist" className="inline-flex rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
          {([['proximas', 'Próximas', proximas.length], ['pasadas', 'Pasadas', pasadas.length]] as const).map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={pestaña === id} onClick={() => setPestaña(id)}
              className={cn('h-8 cursor-pointer rounded-md px-3 text-[12.5px]', pestaña === id ? 'bg-card font-semibold shadow-xs' : 'text-(--fg-2)')}>
              {label} <span className="tabular-nums text-(--fg-muted)">{n}</span>
            </button>
          ))}
        </div>
        {/* Sin permiso, el aviso de demo nueva sale igual, como toast adentro de la app. */}
        {permiso === 'default' && (
          <Button size="sm" variant="outline" className="ml-auto"
            onClick={() => { pedirPermisoDeAvisos(); setTimeout(() => setPermiso(Notification.permission), 1500) }}>
            <Bell className="size-4" />
            Activar avisos del navegador
          </Button>
        )}
      </header>
      {demosQ.isLoading ? (
        <div className="h-48 animate-pulse rounded-lg bg-secondary" />
      ) : demosQ.error && !demosQ.data ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-foreground">No pudimos cargar las demos.</p>
          <button type="button" className="text-sm underline" onClick={() => void demosQ.refetch()}>Reintentar</button>
        </div>
      ) : filas.length === 0 ? (
        <p className="text-sm text-(--fg-2)">{pestaña === 'proximas' ? 'No hay demos agendadas.' : 'Todavía no pasó ninguna demo.'}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuándo</TableHead>
              <TableHead>Inmobiliaria</TableHead>
              <TableHead>Agendó</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Invitación · asisten</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Agendada el</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(d => <FilaDemo key={d.id} d={d} usuarios={porId} />)}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
