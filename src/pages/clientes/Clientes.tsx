import { useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { inicioDe } from '@/components/nav'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import type { Usuario } from '@/pages/crm/types'
import { useAsignarOnboarding, useClientesRealtime, useOnboardings, usePlantillas } from './hooks/useClientes'
import { PASOS, PASOS_ABIERTOS, pasoActual, pasoHecho, pasosHechos } from './lib/pasos'
import { datosDelAlta, type DatosDelAlta } from './components/datosDelAlta'
import { OnboardingDialog } from './components/OnboardingDialog'

const LEAD_PARAM = 'lead'
const fmtFecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })

function Avance({ hechas }: { hechas: Set<string> }) {
  const actual = pasoActual(hechas)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex w-24 gap-0.5" title={`${pasosHechos(hechas)} de ${PASOS_ABIERTOS.length} pasos`}>
        {PASOS_ABIERTOS.map(p => {
          const i = PASOS.indexOf(p)
          return <i key={p.id} className={cn('h-1.5 flex-1 rounded-sm', pasoHecho(p, hechas) ? 'bg-success' : i === actual ? 'bg-primary' : 'bg-(--line)')} />
        })}
      </div>
      <span className="text-[11.5px] text-(--fg-muted) tabular-nums">{pasosHechos(hechas)} de {PASOS_ABIERTOS.length}</span>
    </div>
  )
}

function Fila({ d, lleva, yo, onAbrir }: { d: DatosDelAlta; lleva: Usuario | undefined; yo: Usuario; onAbrir: () => void }) {
  const asignar = useAsignarOnboarding()
  const hechas = new Set(d.o.tareas.map(t => t.task_id))
  const actual = pasoActual(hechas)
  return (
    <TableRow className="cursor-pointer" onClick={onAbrir}>
      <TableCell className="max-w-72">
        <div className="truncate font-medium">{d.inmobiliaria}</div>
        <div className="truncate text-[12px] text-(--fg-muted)">{d.nombreResponsable || '—'}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-(--fg-2)" title={new Date(d.o.created_at).toLocaleString('es-ES')}>
        {fmtFecha.format(new Date(d.o.created_at))}
      </TableCell>
      <TableCell><Avance hechas={hechas} /></TableCell>
      <TableCell>
        {actual === null
          ? <span className="rounded-full bg-success/15 px-2 py-0.5 text-[12px] font-semibold text-success">Listo para completar</span>
          : <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold text-primary">{actual + 1} · {PASOS[actual].titulo}</span>}
      </TableCell>
      <TableCell className="text-[12.5px]">
        {d.orgId ? 'Vinculada' : <span className="text-(--fg-muted)">Sin crear</span>}
      </TableCell>
      <TableCell>
        {lleva ? (
          <span className="inline-flex items-center gap-1.5"><AvatarUsuario usuario={lleva} titulo={lleva.nombre} />{lleva.nombre}</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[12px] font-semibold text-(--fg-2)">Sin asignar</span>
            <button type="button" className="cursor-pointer text-[12.5px] text-primary hover:underline"
              onClick={e => { e.stopPropagation(); asignar.mutate({ onboardingId: d.o.id, userId: yo.id }) }}>Tomar</button>
          </span>
        )}
      </TableCell>
    </TableRow>
  )
}

/* NUEVO (26/10/2026, por pedido). Las inmobiliarias que se están dando de alta: los leads con
   `lead_type = 'ONBOARDING'`, que entran solos cuando el comercial los pasa a «Contratado» (trigger
   de la migración `20261026184212_clientes_onboarding`). Solo SUPERADMIN: `NAV` y el gate de acá
   adentro, como Demos. El onboarding se abre en un dialog con `?lead=<id>`. Diseño en
   docs/onboarding/clientes.html. */
export function Clientes() {
  const { yo, esSuperadmin, usuarios } = useCarteras()
  useClientesRealtime(esSuperadmin)
  const onboardings = useOnboardings(esSuperadmin)
  const plantillas = usePlantillas(esSuperadmin)
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')

  const porId = useMemo(() => new Map(usuarios.map(u => [u.id, u])), [usuarios])
  const altas = useMemo(() => (onboardings.data ?? []).map(o =>
    datosDelAlta(o, plantillas.data ?? [], porId.get(o.assigned_to ?? '')?.nombre ?? yo?.nombre ?? 'el equipo de Propelia')),
  [onboardings.data, plantillas.data, porId, yo])
  const visibles = altas.filter(d => `${d.inmobiliaria} ${d.nombreResponsable}`.toLowerCase().includes(busca.trim().toLowerCase()))
  const abierta = altas.find(d => d.o.lead.id === params.get(LEAD_PARAM)) ?? null

  const abrir = (leadId: string | null) => setParams(p => {
    const n = new URLSearchParams(p)
    if (leadId) n.set(LEAD_PARAM, leadId)
    else n.delete(LEAD_PARAM)
    return n
  })

  if (!yo) return null
  if (!esSuperadmin) return <Navigate to={inicioDe(yo.rol)} replace />

  return (
    <div className="ui-scale-md flex flex-col gap-3 p-4 max-md:p-2">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        <span className="text-[13px] text-(--fg-muted)">{altas.length} en onboarding</span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--fg-muted)" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar inmobiliaria…" aria-label="Buscar inmobiliaria" className="h-8 w-60 pl-8" />
        </div>
      </header>
      {onboardings.isLoading ? (
        <div className="h-48 animate-pulse rounded-lg bg-secondary" />
      ) : onboardings.error && !onboardings.data ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-foreground">No pudimos cargar los clientes.</p>
          <button type="button" className="text-sm underline" onClick={() => void onboardings.refetch()}>Reintentar</button>
        </div>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-(--fg-2)">
          {altas.length ? 'Nada coincide con la búsqueda.' : 'No hay altas en curso. Un lead aparece acá cuando el comercial lo pasa a «Contratado».'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inmobiliaria</TableHead>
              <TableHead>Firmó</TableHead>
              <TableHead>Avance</TableHead>
              <TableHead>Paso actual</TableHead>
              <TableHead>Org en Propelia</TableHead>
              <TableHead>Lleva el alta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map(d => (
              <Fila key={d.o.id} d={d} lleva={porId.get(d.o.assigned_to ?? '')} yo={yo} onAbrir={() => abrir(d.o.lead.id)} />
            ))}
          </TableBody>
        </Table>
      )}
      <OnboardingDialog datos={abierta} lleva={abierta ? porId.get(abierta.o.assigned_to ?? '') : undefined} yo={yo} onCerrar={() => abrir(null)} />
    </div>
  )
}
