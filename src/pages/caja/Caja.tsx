import { PlusIcon, TagIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DatesSelectorV2 } from '@/components/datesSelectorV2/DatesSelectorV2'
import { findPreset } from '@/components/datesSelectorV2/presets'
import type { DatesValue } from '@/components/datesSelectorV2/types'
import { useDatesValueParams } from '@/components/datesSelectorV2/useDatesValueParams'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { parseCalendarDay, todayLocal } from '@/lib/dates'
import { ConfirmarPagoDialog } from './components/ConfirmarPagoDialog'
import { EditarEtiquetaDialog } from './components/EditarEtiquetaDialog'
import { GestionarEtiquetasDialog } from './components/GestionarEtiquetasDialog'
import { ListaGastos } from './components/ListaGastos'
import { NuevaEtiquetaDialog } from './components/NuevaEtiquetaDialog'
import { NuevoGastoDialog } from './components/NuevoGastoDialog'
import { PropagarCambioDialog } from './components/PropagarCambioDialog'
import { ResumenCaja } from './components/ResumenCaja'
import { Segmentado } from './components/Segmentado'
import { useCajaMutaciones } from './hooks/useCajaMutaciones'
import { useEtiquetas, useUsoDeEtiquetas } from './hooks/useEtiquetas'
import { useGastos } from './hooks/useGastos'
import { nuevaEtiqueta } from './lib/altas'
import { escribirConPendientes, escribirTipo, leerConPendientes, leerTipo } from './lib/cajaParams'
import { cambiosDeEtiqueta } from './lib/etiquetas'
import { filasDelRango } from './lib/filas'
import { prefillDePagarFijo } from './lib/formularios'
import { periodOf } from './lib/periodos'
import { resumenDeFilas } from './lib/resumen'
import type { AlcancePropagacion, CambiosPropagables } from './service/caja.service'
import type { Etiqueta, FiltroTipo, FilaCaja, TipoGasto } from './types'

type Prefill = ReturnType<typeof prefillDePagarFijo>
type ValoresEtiqueta = { name: string; expense_type: TipoGasto; default_amount: number | null; due_day: number | null }

const DIA_CORTO: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
const textoDeRango = (from: string, to: string) =>
  from === to
    ? parseCalendarDay(from).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${parseCalendarDay(from).toLocaleDateString('es-ES', DIA_CORTO)} → ${parseCalendarDay(to).toLocaleDateString('es-ES', DIA_CORTO)}`

/* La Caja se mira por mes: el selector arranca en «Este mes entero». Los filtros (tipo, pendientes)
   viven en la URL; las fechas, en useDatesValueParams. Acá se cablean los hooks y se decide qué
   dialog está abierto; las cuentas son de lib/ y los dialogs solo reciben datos y callbacks. */
export function Caja() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tipo = leerTipo(searchParams)
  const conPendientes = leerConPendientes(searchParams)
  const porDefecto: DatesValue = { mode: 'range', primary: findPreset('esteMes')!.resolve(), compare: null }
  const [fechas, setFechas] = useDatesValueParams(porDefecto)
  const rango = fechas.primary

  const gastosQ = useGastos(rango)
  const etiquetasQ = useEtiquetas()
  const usoQ = useUsoDeEtiquetas()
  const m = useCajaMutaciones()
  // keepPreviousData: mientras se trae el rango nuevo `data` es la ventana ANTERIOR, y armar filas
  // con ella y el rango nuevo inventa «Pendientes» y totales falsos. Se trata como cargando.
  const gastosViejos = gastosQ.isPlaceholderData
  const gastos = gastosViejos ? undefined : gastosQ.data
  const etiquetas = etiquetasQ.data
  const uso = usoQ.data ?? {}

  // Qué dialog está abierto. Editar y propagar van encima del gestor; «Nueva» encima del gestor
  // (la del alta vive adentro de NuevoGastoDialog).
  const [alta, setAlta] = useState<{ prefill: Prefill | null } | null>(null)
  const [pago, setPago] = useState<FilaCaja | null>(null)
  const [gestionando, setGestionando] = useState(false)
  const [nuevaDelGestor, setNuevaDelGestor] = useState(false)
  const [editando, setEditando] = useState<Etiqueta | null>(null)
  const [propagar, setPropagar] = useState<{ etiquetaId: string; campos: string[]; cambios: CambiosPropagables } | null>(null)

  const todas = useMemo(
    () => filasDelRango(gastos ?? [], etiquetas ?? [], rango, conPendientes),
    [gastos, etiquetas, rango, conPendientes],
  )
  const cargando = gastosQ.isPending || gastosViejos || etiquetasQ.isPending
  const resumen = useMemo(() => resumenDeFilas(todas), [todas])
  const filas = tipo === 'all' ? todas : todas.filter(f => f.kind === tipo)
  const cuenta = (t: FiltroTipo) => (t === 'all' ? todas.length : todas.filter(f => f.kind === t).length)

  const crearEtiqueta = (v: ValoresEtiqueta) => m.crearEtiqueta.mutateAsync(nuevaEtiqueta(v))

  const guardarEdicion = async (e: Etiqueta, v: ValoresEtiqueta) => {
    await m.editarEtiqueta.mutateAsync({
      id: e.id,
      patch: {
        name: v.name, expense_type: v.expense_type, recurrence: v.expense_type === 'FIXED' ? 'MONTHLY' : 'ONE_TIME',
        default_amount: v.default_amount, due_day: v.due_day,
      },
    })
    setEditando(null)
    // El monto y el vencimiento no se copian a los gastos: solo el nombre y el tipo piden la
    // pregunta, y sin gastos registrados no hay nada que preguntar.
    const { campos, cambios } = cambiosDeEtiqueta(e, v)
    if (campos.length && (uso[e.id] ?? 0) > 0) setPropagar({ etiquetaId: e.id, campos, cambios })
  }

  const aplicarPropagacion = async (scope: AlcancePropagacion) => {
    if (!propagar) return
    try {
      if (scope !== 'none') {
        await m.propagarCambio.mutateAsync({ etiquetaId: propagar.etiquetaId, cambios: propagar.cambios, scope, mesActual: periodOf(todayLocal()) })
      }
      setPropagar(null)
    } catch { /* toast de la mutación: la pregunta sigue abierta para reintentar */ }
  }

  const pagar = (f: FilaCaja) => {
    // Un fijo pendiente (mes sin fila) abre el alta con todo cargado; un variable, «Confirmar pago».
    if (f.status === 'NONE' && f.etiqueta) setAlta({ prefill: prefillDePagarFijo(f.etiqueta, f.period) })
    else if (f.gasto) setPago(f)
  }

  // Sin etiquetas el alta y el gestor no tienen con qué abrirse: mejor deshabilitados que mudos.
  const sinEtiquetas = !etiquetas

  const nuevo = () => setAlta({ prefill: null })

  return (
    // `ui-scale-md`: la escala del producto en escritorio y 1 en el teléfono (objetivos táctiles).
    <div className="ui-scale-md mx-auto flex max-w-[1120px] flex-col gap-5 px-6 pb-16 pt-4 max-md:px-4">
      <h1 className="text-lg font-semibold text-foreground">Caja</h1>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <DatesSelectorV2 activatedModes={['single', 'range']} value={fechas} onChange={setFechas} />
        <div className="flex gap-2 max-md:w-full [&>button]:max-md:flex-1">
          <Button variant="outline" title="Gestionar etiquetas" disabled={sinEtiquetas} onClick={() => setGestionando(true)}>
            <Icon icon={TagIcon} size="sm" />Etiquetas
          </Button>
          <Button onClick={nuevo} disabled={sinEtiquetas}><Icon icon={PlusIcon} size="xs" />Nuevo gasto</Button>
        </div>
      </header>

      {etiquetasQ.isError && (
        <p role="alert" className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-danger">
          No se pudieron cargar las etiquetas. Recargá la página para volver a intentar.
        </p>
      )}

      <ResumenCaja resumen={resumen} conPendientes={conPendientes} cargando={cargando} />

      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <Segmentado
            label="Tipo de gasto" valor={tipo} onChange={t => setSearchParams(prev => escribirTipo(prev, t), { replace: true })}
            opciones={[
              { valor: 'all', label: 'Todos', cuenta: cuenta('all') },
              { valor: 'FIXED', label: 'Fijos', cuenta: cuenta('FIXED') },
              { valor: 'VARIABLE', label: 'Variables', cuenta: cuenta('VARIABLE') },
            ]}
          />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2" title="Sumar a la lista y a los totales lo que todavía no se pagó: variables pendientes y fijos sin pagar en el período">
              <Switch id="caja-pendientes" checked={conPendientes}
                onCheckedChange={v => setSearchParams(prev => escribirConPendientes(prev, v), { replace: true })} />
              <Label htmlFor="caja-pendientes" className="cursor-pointer text-xs font-medium text-(--fg-2)">+ Pendientes</Label>
            </div>
            <span className="text-xs text-(--fg-muted)">{textoDeRango(rango.from, rango.to)}</span>
          </div>
        </div>
        <ListaGastos
          filas={filas}
          variosMeses={periodOf(rango.from) !== periodOf(rango.to)}
          cargando={cargando}
          error={gastosQ.isError || etiquetasQ.isError}
          onPagar={pagar}
          onBorrar={id => m.borrarGasto.mutate(id)}
          onNuevo={sinEtiquetas ? () => {} : nuevo}
        />
      </div>

      {alta && etiquetas && (
        <NuevoGastoDialog
          prefill={alta.prefill}
          etiquetas={etiquetas}
          gastos={gastos ?? []}
          guardando={m.crearGasto.isPending}
          guardandoEtiqueta={m.crearEtiqueta.isPending}
          onGuardar={async insert => { await m.crearGasto.mutateAsync(insert); setAlta(null) }}
          onCrearEtiqueta={crearEtiqueta}
          onCerrar={() => setAlta(null)}
        />
      )}

      {pago?.gasto && (
        <ConfirmarPagoDialog
          gasto={pago.gasto}
          guardando={m.confirmarPago.isPending}
          onConfirmar={async p => { await m.confirmarPago.mutateAsync({ id: pago.gasto!.id, ...p }); setPago(null) }}
          onCerrar={() => setPago(null)}
        />
      )}

      {gestionando && etiquetas && (
        <GestionarEtiquetasDialog
          etiquetas={etiquetas}
          uso={uso}
          onNueva={() => setNuevaDelGestor(true)}
          onEditar={setEditando}
          onEliminar={e => m.borrarEtiqueta.mutateAsync(e.id)}
          onCerrar={() => setGestionando(false)}
        />
      )}

      {nuevaDelGestor && etiquetas && (
        <NuevaEtiquetaDialog
          nombre="" tipo="FIXED" etiquetas={etiquetas} guardando={m.crearEtiqueta.isPending}
          // Una etiqueta fija nueva ya es un pendiente de este mes: la lista se refresca con la invalidación.
          onCrear={async v => { const e = await crearEtiqueta(v); setNuevaDelGestor(false); return e }}
          onCerrar={() => setNuevaDelGestor(false)}
        />
      )}

      {editando && etiquetas && (
        <EditarEtiquetaDialog
          etiqueta={editando}
          etiquetas={etiquetas}
          guardando={m.editarEtiqueta.isPending}
          onGuardar={v => guardarEdicion(editando, v)}
          onCerrar={() => setEditando(null)}
        />
      )}

      {propagar && (
        <PropagarCambioDialog
          campos={propagar.campos}
          guardando={m.propagarCambio.isPending}
          onElegir={scope => void aplicarPropagacion(scope)}
          onCerrar={() => setPropagar(null)}
        />
      )}
    </div>
  )
}
