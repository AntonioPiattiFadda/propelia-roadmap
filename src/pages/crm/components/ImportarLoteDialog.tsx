import { useState } from 'react'
import { FileSpreadsheetIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCarteras } from '../hooks/useCarteras'
import { useImportarLote } from '../hooks/useLeadMutaciones'
import { mensajeDeError } from '../lib/errores'
import { leerLote, type FilaDelLote } from '../lib/importarLote'
import { leerPrimeraHoja } from '../service/excel'
import type { ResultadoDeFila, ResultadoDelImport } from '../service/crm.service'

const MAX_ERRORES = 15

type Leido = { nombre: string; lote: string; filas: FilaDelLote[] }

/**
 * NUEVO. Importar un lote de inmobiliarias del Excel (formato BCN-S01) a la cartera de quien se
 * elija. Tres pasos en el mismo dialog: elegir archivo y responsable, revisar (la base hace todo
 * en simulacro y lo deshace) y confirmar. Solo lo monta la cabecera para un SUPERADMIN; la RPC lo
 * exige igual. Las reglas están en `lib/importarLote.ts` (el archivo) y en `crm_importar_lote`
 * (la base).
 */
export function ImportarLoteDialog() {
  const { usuarios } = useCarteras()
  const importar = useImportarLote()
  const [abierto, setAbierto] = useState(false)
  const [leido, setLeido] = useState<Leido | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [responsable, setResponsable] = useState('')
  const [preview, setPreview] = useState<ResultadoDelImport | null>(null)
  const [errorBase, setErrorBase] = useState<string | null>(null)
  // Para probar un lote nuevo sin cargarlo entero. Lo que entra queda: el resto del archivo,
  // importado después, la reconoce como ya existente.
  const [soloPrimera, setSoloPrimera] = useState(true)
  const activos = usuarios.filter(u => u.activo)
  const nombreDe = (id: string) => usuarios.find(u => u.id === id)?.nombre ?? 'esa persona'

  const reiniciar = () => {
    setLeido(null); setErrores([]); setResponsable(''); setPreview(null); setErrorBase(null)
  }
  const cambiarAbierto = (v: boolean) => {
    if (!v) reiniciar()
    setAbierto(v)
  }

  const elegirArchivo = async (archivo: File | undefined) => {
    setLeido(null); setErrores([]); setPreview(null); setErrorBase(null)
    if (!archivo) return
    try {
      const r = leerLote(await leerPrimeraHoja(archivo))
      if (r.ok) setLeido({ nombre: archivo.name, lote: r.lote, filas: r.filas })
      else setErrores(r.errores.map(e => e.mensaje))
    } catch {
      setErrores(['No se pudo leer el archivo. ¿Es un .xlsx?'])
    }
  }

  const correr = async (simular: boolean) => {
    if (!leido || !responsable) return
    setErrorBase(null)
    try {
      const filas = soloPrimera ? leido.filas.slice(0, 1) : leido.filas
      const r = await importar.mutateAsync({ assignedTo: responsable, filas, simular })
      if (simular) { setPreview(r); return }
      const n = r.filas.filter(f => f.resultado === 'nueva' || f.resultado === 'posible_repetida').length
      toast.success(`Lote ${leido.lote}: ${n} ${n === 1 ? 'lead nuevo' : 'leads nuevos'} para ${nombreDe(responsable)}.`)
      cambiarAbierto(false)
    } catch (e) {
      setErrorBase(mensajeDeError(e, simular ? 'No se pudo revisar el lote.' : 'No se pudo importar el lote.'))
    }
  }

  const de = (r: ResultadoDeFila['resultado']) => preview?.filas.filter(f => f.resultado === r) ?? []
  const nuevas = de('nueva'), posibles = de('posible_repetida'), conContactos = de('contactos_nuevos'), sinNovedad = de('sin_novedad')
  const aCrear = nuevas.length + posibles.length

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={FileSpreadsheetIcon} size="xs" />
          Importar lote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none">
        <DialogHeader>
          <DialogTitle>Importar lote</DialogTitle>
          <DialogDescription>
            El Excel de inmobiliarias en formato BCN-S01. Antes de importar se revisa: no se escribe nada hasta confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lote-archivo" className="text-[12.5px] font-semibold">Archivo</Label>
            <input id="lote-archivo" type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => void elegirArchivo(e.target.files?.[0])}
              className="text-[13px] file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-(--surface-2) file:px-3 file:py-1.5 file:text-[13px] file:font-semibold" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[12.5px] font-semibold">Asignar a</Label>
            <Select value={responsable} onValueChange={v => { setResponsable(v); setPreview(null) }}>
              <SelectTrigger><SelectValue placeholder="Elegí quién los trabaja" /></SelectTrigger>
              <SelectContent>
                {activos.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}{u.rol === 'SDR' ? ' · SDR' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={soloPrimera} onCheckedChange={v => { setSoloPrimera(v === true); setPreview(null) }} />
          Probar con la primera fila
        </label>

        {errores.length > 0 && (
          <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <p className="font-semibold">El archivo no se puede importar:</p>
            <ul className="mt-1 list-disc pl-5">
              {errores.slice(0, MAX_ERRORES).map(e => <li key={e}>{e}</li>)}
            </ul>
            {errores.length > MAX_ERRORES && <p className="mt-1">…y {errores.length - MAX_ERRORES} más.</p>}
          </div>
        )}

        {leido && !preview && (
          <p className="text-[13px] text-(--fg-muted)">
            {leido.nombre}: lote <b>{leido.lote}</b>, {leido.filas.length} inmobiliarias. Todo en orden en el archivo.
          </p>
        )}

        {preview && leido && (
          <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto text-[13px]">
            <ul className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
              <Contador n={nuevas.length} texto="nuevas" />
              <Contador n={posibles.length} texto="posibles repetidas (se crean con aviso)" />
              <Contador n={conContactos.length} texto="ya existían y traen contactos nuevos" />
              <Contador n={sinNovedad.length} texto="ya existían sin nada nuevo (se saltean)" />
            </ul>
            {preview.etiquetas_nuevas.length > 0 && (
              <p>CRMs nuevos en el catálogo: {preview.etiquetas_nuevas.join(', ')}.</p>
            )}
            <Detalle titulo="Posibles repetidas" filas={posibles} />
            <Detalle titulo="Contactos nuevos que se suman al consejo" filas={conContactos} />
          </div>
        )}

        {errorBase && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorBase}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => cambiarAbierto(false)}>Cancelar</Button>
          {preview ? (
            <Button onClick={() => void correr(false)} disabled={importar.isPending || (aCrear === 0 && conContactos.length === 0)}>
              {importar.isPending ? 'Importando…' : `Importar ${aCrear} ${aCrear === 1 ? 'lead' : 'leads'} a ${nombreDe(responsable)}`}
            </Button>
          ) : (
            <Button onClick={() => void correr(true)} disabled={!leido || !responsable || importar.isPending}>
              {importar.isPending ? 'Revisando…' : 'Revisar lote'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Contador({ n, texto }: { n: number; texto: string }) {
  return (
    <li className="rounded-md bg-(--surface-2) px-3 py-2 [border:1px_solid_var(--line-soft)]">
      <b className="text-[15px] tabular-nums">{n}</b> {texto}
    </li>
  )
}

function Detalle({ titulo, filas }: { titulo: string; filas: ResultadoDeFila[] }) {
  if (filas.length === 0) return null
  return (
    <details>
      <summary className="cursor-pointer font-semibold">{titulo} ({filas.length})</summary>
      <ul className="mt-1 flex flex-col gap-1 pl-4">
        {filas.map(f => (
          <li key={f.fila}>
            <span className="font-medium">Fila {f.fila} · {f.empresa}</span>
            {f.detalle && <span className="block text-(--fg-muted)">{f.detalle}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}
