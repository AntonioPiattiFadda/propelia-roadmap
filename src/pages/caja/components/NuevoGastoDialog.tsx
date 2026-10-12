import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { todayLocal } from '@/lib/dates'
import type { TablesInsert } from '@/types/database.types'
import { mismoNombre, etiquetasVivas } from '../lib/etiquetas'
import { hayGastoDelMes, validarGasto, type prefillDePagarFijo } from '../lib/formularios'
import { eur, montoAInput } from '../lib/monto'
import { periodOf, tituloDePeriodo } from '../lib/periodos'
import type { Etiqueta, EstadoGasto, Gasto, Pagador, TipoGasto } from '../types'
import { EtiquetaCombobox } from './EtiquetaCombobox'
import { NuevaEtiquetaDialog } from './NuevaEtiquetaDialog'
import { PagadorPicker } from './PagadorPicker'
import { ETIQUETA_DE_TIPO, PillTipo } from './PillTipo'
import { Segmentado } from './Segmentado'

type Prefill = ReturnType<typeof prefillDePagarFijo>
type ValoresEtiqueta = { name: string; expense_type: TipoGasto; default_amount: number | null; due_day: number | null }

const Campo = ({ htmlFor, label, children }: { htmlFor?: string; label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-semibold text-(--fg-2)">{label}</Label>
    {children}
  </div>
)

/**
 * «Nuevo gasto · Fijo|Variable». Todo gasto lleva etiqueta (también los variables). Cargar un fijo
 * ES pagarlo: no tiene estado, siempre sale PAID con fecha de pago. Se monta solo mientras está
 * abierto. `prefill` viene de «Pagar» en un fijo pendiente: etiqueta, monto habitual y período.
 * `gastos` es lo que la pantalla ya trajo: avisa «ya está pagado» antes de que lo frene la base.
 * «Pagó» arranca en `yo` (quien lo carga), que es lo más común, pero es otro dato que `created_by`.
 */
export function NuevoGastoDialog({ prefill, etiquetas, gastos, pagadores, yo, guardando, guardandoEtiqueta, onGuardar, onCrearEtiqueta, onCerrar }: {
  prefill: Prefill | null
  etiquetas: Etiqueta[]
  gastos: Gasto[]
  pagadores: Pagador[]
  yo: string | null
  guardando: boolean
  guardandoEtiqueta: boolean
  onGuardar: (insert: TablesInsert<'expenses'>) => Promise<void>
  onCrearEtiqueta: (valores: ValoresEtiqueta) => Promise<Etiqueta>
  onCerrar: () => void
}) {
  const [tipo, setTipo] = useState<TipoGasto>(prefill?.tipo ?? 'FIXED')
  const [etiqueta, setEtiquetaEstado] = useState<Etiqueta | null>(prefill?.etiqueta ?? null)
  // El blur del combobox corre en el mismo tick que el clic/Enter que elige, con el closure viejo
  // (`etiqueta === null`): `onSalir` lee este ref, que se actualiza síncrono, y no el estado.
  const etiquetaRef = useRef<Etiqueta | null>(prefill?.etiqueta ?? null)
  const setEtiqueta = (e: Etiqueta | null) => { etiquetaRef.current = e; setEtiquetaEstado(e) }
  const [texto, setTexto] = useState(prefill?.etiqueta.name ?? '')
  const [monto, setMonto] = useState(prefill?.monto ?? '')
  const [fecha, setFecha] = useState(todayLocal())
  const [period, setPeriod] = useState(prefill?.period ?? periodOf(todayLocal()))
  const [estado, setEstado] = useState<EstadoGasto>('PAID')
  const [notas, setNotas] = useState('')
  const [pagadoPor, setPagadoPor] = useState<string | null>(yo)
  const [error, setError] = useState('')
  const [cbAbierto, setCbAbierto] = useState(false)
  const [creando, setCreando] = useState<string | null>(null)
  // Un ref y no solo el estado: el blur del combobox llega en el mismo tick en que se abre «Nueva etiqueta».
  const creandoRef = useRef(false)
  const comboRef = useRef<HTMLInputElement>(null)
  const montoRef = useRef<HTMLInputElement>(null)

  const fijo = tipo === 'FIXED'
  const pendiente = !fijo && estado === 'PENDING'
  const yaPagado = !!etiqueta && fijo && hayGastoDelMes(gastos, etiqueta.id, period)

  const tomar = (e: Etiqueta) => {
    setEtiqueta(e)
    setTexto(e.name)
    setTipo(e.expense_type)
    if (e.default_amount != null) setMonto(montoAInput(e.default_amount))
    setError('')
  }

  const escribir = (t: string) => {
    setTexto(t)
    // Escribir el nombre exacto también elige, como en ms-frontend.
    const exacta = etiquetasVivas(etiquetas, tipo).find(e => mismoNombre(e.name, t)) ?? null
    setEtiqueta(exacta)
    if (exacta?.default_amount != null) setMonto(montoAInput(exacta.default_amount))
  }

  const cambiarTipo = (nuevo: TipoGasto) => {
    setTipo(nuevo)
    // Las etiquetas son de un tipo: cambiar de tipo suelta la elegida.
    if (etiqueta && etiqueta.expense_type !== nuevo) { setEtiqueta(null); setTexto('') }
    setCbAbierto(false)
  }

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (guardando) return
    const r = validarGasto({ etiqueta, monto, fecha, period, estado: fijo ? 'PAID' : estado, notas, pagadoPor, yaPagado })
    if ('error' in r) return setError(r.error)
    setError('')
    // Un solo canal de error: el toast de la mutación. Si falla, el dialog sigue abierto.
    try { await onGuardar(r.insert) } catch { /* ya avisó el toast */ }
  }

  const cerrarNueva = () => { creandoRef.current = false; setCreando(null); comboRef.current?.focus() }

  return (
    <>
      <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
        <DialogContent
          className="sm:max-w-[440px] max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none"
          // Escape cierra la lista del combobox y no el dialog.
          onEscapeKeyDown={ev => { if (cbAbierto) { ev.preventDefault(); setCbAbierto(false) } }}
          onOpenAutoFocus={ev => { ev.preventDefault(); (prefill ? montoRef : comboRef).current?.focus() }}
        >
          <form onSubmit={enviar} noValidate className="grid gap-3">
            <DialogHeader><DialogTitle>Nuevo gasto · {ETIQUETA_DE_TIPO[tipo]}</DialogTitle></DialogHeader>
            <Campo label="Tipo">
              <Segmentado label="Tipo" valor={tipo} onChange={cambiarTipo} className="self-start"
                opciones={[{ valor: 'FIXED', label: 'Fijo' }, { valor: 'VARIABLE', label: 'Variable' }]} />
            </Campo>
            <Campo htmlFor="gasto-etiqueta" label="Etiqueta *">
              <EtiquetaCombobox
                id="gasto-etiqueta" inputRef={comboRef} etiquetas={etiquetas} tipo={tipo} texto={texto}
                abierto={cbAbierto} onAbiertoChange={setCbAbierto} onTexto={escribir}
                onElegir={e => { tomar(e); setCbAbierto(false); montoRef.current?.focus(); montoRef.current?.select() }}
                onCrear={nombre => { creandoRef.current = true; setCreando(nombre); setCbAbierto(false) }}
                // Salir sin una etiqueta que exista la borra: un gasto no queda con un nombre suelto.
                onSalir={() => { if (!creandoRef.current && !etiquetaRef.current) setTexto('') }}
              />
              {etiqueta && (
                <div className="flex min-h-[18px] flex-wrap items-center gap-1 text-xs text-(--fg-2)">
                  <PillTipo tipo={etiqueta.expense_type} className="mr-0.5 px-2 py-px" />
                  {etiqueta.expense_type === 'FIXED' && (
                    <span>
                      Mensual{etiqueta.due_day ? ` · vence el ${etiqueta.due_day}` : ''}{etiqueta.default_amount != null ? ` · ${eur(etiqueta.default_amount)} habitual` : ''}
                    </span>
                  )}
                  {yaPagado && <b className="font-semibold text-[#8A5A0B]">· {tituloDePeriodo(period)} ya está pagado</b>}
                </div>
              )}
            </Campo>
            {fijo ? (
              <Campo htmlFor="gasto-periodo" label="Período que cubre *">
                <Input id="gasto-periodo" type="month" value={period} onChange={ev => setPeriod(ev.target.value)} />
              </Campo>
            ) : (
              <Campo label="Estado">
                <Segmentado label="Estado" valor={estado} onChange={setEstado} className="self-start"
                  opciones={[{ valor: 'PAID', label: 'Pagado' }, { valor: 'PENDING', label: 'Pendiente' }]} />
              </Campo>
            )}
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <Campo htmlFor="gasto-monto" label="Monto (€) *">
                <Input id="gasto-monto" ref={montoRef} inputMode="decimal" placeholder="0,00" value={monto} onChange={ev => setMonto(ev.target.value)} />
              </Campo>
              <Campo htmlFor="gasto-fecha" label={pendiente ? 'Fecha esperada *' : 'Fecha de pago *'}>
                <Input id="gasto-fecha" type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} />
              </Campo>
            </div>
            {!pendiente && (
              <Campo htmlFor="gasto-pagador" label="Pagó *">
                <PagadorPicker id="gasto-pagador" pagadores={pagadores} valor={pagadoPor} onChange={setPagadoPor} />
              </Campo>
            )}
            {!fijo && (
              <Campo htmlFor="gasto-notas" label="Notas">
                <Textarea id="gasto-notas" placeholder="Opcional" value={notas} onChange={ev => setNotas(ev.target.value)} />
              </Campo>
            )}
            <p role="alert" className="min-h-4 text-xs text-danger">{error}</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
              <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {creando !== null && (
        <NuevaEtiquetaDialog
          nombre={creando} tipo={tipo} etiquetas={etiquetas} guardando={guardandoEtiqueta}
          onCerrar={cerrarNueva}
          // Vuelve al alta con la etiqueta recién creada ya elegida.
          onCrear={async v => {
            const creada = await onCrearEtiqueta(v)
            tomar(creada)
            creandoRef.current = false
            setCreando(null)
            setTimeout(() => montoRef.current?.focus(), 0)
            return creada
          }}
        />
      )}
    </>
  )
}
