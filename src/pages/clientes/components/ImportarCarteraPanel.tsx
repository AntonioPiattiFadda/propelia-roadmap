import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  FILAS_POR_LOTE, FOTOS_POR_LOTE, HOJA_DE_FOTOS, importarLoteDeCartera, importarLoteDeFotos, PUENTE_SIMULADO, revisarCartera,
  type FilaRevisada, type RevisionDeFotos,
} from '../service/puente'
import { useMarcarTarea } from '../hooks/useClientes'
import { claveDeTarea } from '../lib/pasos'
import type { DatosDelAlta } from './datosDelAlta'

type Revision =
  | { estado: 'revisando' }
  | { estado: 'error'; error: string }
  | { estado: 'lista'; filas: FilaRevisada[]; fotos: RevisionDeFotos | null }

const vacia = (fila: string[]) => fila.every(c => !c.trim())

/* El import de la cartera (paso 2), como en el producto: el Excel se lee acá (celdas crudas, sin
   interpretar) y el producto lo revisa (`check_properties`) y lo importa en lotes de 50
   (`import_properties`), completando las direcciones con Google. Las filas con error no se
   importan; las que ya estaban en la org (mismo código de Idealista) se saltean. Al terminar se
   tilda «Importar la cartera».
   Con «Importar fotos» (2/11/2026) llega también la hoja «Fotos»: la revisión dice cuántas son
   nuevas y, después de las propiedades, se bajan de Idealista y se suben en lotes de 20
   (`import_photos`). Una foto que ya estaba en la propiedad no se vuelve a subir, así que
   reimportar el mismo Excel suma sólo las que faltan. */
export function ImportarCarteraPanel({ datos, archivo, hoja, fotos, onCerrar }: {
  datos: DatosDelAlta; archivo: string; hoja: string[][]; fotos: string[][] | null; onCerrar: () => void
}) {
  const [revision, setRevision] = useState<Revision>({ estado: 'revisando' })
  const [progreso, setProgreso] = useState<{ que: 'propiedades' | 'fotos'; hechas: number; total: number } | null>(null)
  const marcar = useMarcarTarea()
  const orgId = datos.orgId!

  useEffect(() => {
    let vivo = true
    revisarCartera(orgId, hoja, fotos)
      .then(r => vivo && setRevision(r.ok ? { estado: 'lista', filas: r.rows, fotos: r.photos ?? null } : { estado: 'error', error: r.error }))
      .catch(e => vivo && setRevision({ estado: 'error', error: e instanceof Error ? e.message : 'No se pudo revisar' }))
    return () => { vivo = false }
  }, [orgId, hoja, fotos])

  if (revision.estado !== 'lista') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-(--line) bg-(--surface-2) p-3 text-[13px]">
        {revision.estado === 'revisando'
          ? <><Loader2 className="size-4 animate-spin" /> Revisando {archivo}…</>
          : <><span className="text-destructive">{archivo}: {revision.error}</span><Button size="sm" variant="outline" className="ml-auto" onClick={onCerrar}>Cerrar</Button></>}
      </div>
    )
  }

  const validas = revision.filas.filter(f => f.valid && !f.existing_property_id)
  const yaEstaban = revision.filas.filter(f => f.existing_property_id).length
  const conError = revision.filas.filter(f => !f.valid)
  const rf = revision.fotos
  const fotosNuevas = rf?.ok ? rf.rows.filter(f => f.status === 'new') : []
  const fotosConError = rf?.ok ? rf.rows.filter(f => f.status === 'invalid') : []

  const importar = async () => {
    let creadas = 0
    let subidas = 0
    const fallidas: { row_number: number; error: string }[] = []
    try {
      if (validas.length) {
        const [cabecera, ...filas] = hoja
        const porNumero = new Map(filas.map((f, i) => [i + 2, f]))
        setProgreso({ que: 'propiedades', hechas: 0, total: validas.length })
        for (let i = 0; i < validas.length; i += FILAS_POR_LOTE) {
          const lote = validas.slice(i, i + FILAS_POR_LOTE).map(f => ({ row_number: f.row_number, cells: porNumero.get(f.row_number) ?? [] }))
          const res = await importarLoteDeCartera(orgId, cabecera, lote)
          creadas += res.filter(r => r.status === 'created').length
          setProgreso({ que: 'propiedades', hechas: Math.min(i + FILAS_POR_LOTE, validas.length), total: validas.length })
        }
      }
      if (fotos && fotosNuevas.length) {
        // Mismos números de fila que la revisión: la cabecera es la primera fila no vacía.
        const inicio = fotos.findIndex(f => !vacia(f))
        const porNumero = new Map(fotos.map((f, i) => [i + 1, f]))
        setProgreso({ que: 'fotos', hechas: 0, total: fotosNuevas.length })
        for (let i = 0; i < fotosNuevas.length; i += FOTOS_POR_LOTE) {
          const lote = fotosNuevas.slice(i, i + FOTOS_POR_LOTE).map(f => ({ row_number: f.row_number, cells: porNumero.get(f.row_number) ?? [] }))
          const res = await importarLoteDeFotos(orgId, fotos[inicio], lote)
          subidas += res.filter(r => r.status === 'created').length
          for (const r of res) if (r.status === 'failed' || r.status === 'invalid') fallidas.push({ row_number: r.row_number, error: r.errors?.join(' · ') ?? '' })
          setProgreso({ que: 'fotos', hechas: Math.min(i + FOTOS_POR_LOTE, fotosNuevas.length), total: fotosNuevas.length })
        }
      }
      marcar.mutate({ onboardingId: datos.o.id, taskId: claveDeTarea('cartera-leads', 'importar'), hecha: true })
      const hecho = fotos ? `${creadas} propiedades y ${subidas} fotos importadas` : `${creadas} propiedades importadas`
      toast.success(hecho, PUENTE_SIMULADO ? { description: 'Puente simulado: en Propelia no se creó nada todavía.' } : undefined)
      if (fallidas.length) {
        toast.warning(`${fallidas.length} fotos no entraron`, {
          description: `${fallidas.slice(0, 3).map(f => `Fila ${f.row_number}: ${f.error}`).join(' · ')}. Volvé a subir el Excel: se suben sólo las que faltan.`,
          duration: 15000,
        })
      }
      onCerrar()
    } catch (e) {
      // Cada lote de propiedades es todo o nada, y cada foto va sola: lo hecho hasta acá quedó, y
      // volver a subir el Excel saltea las propiedades y las fotos que ya están.
      const hasta = fotos ? `${creadas} propiedades y ${subidas} fotos` : `${creadas} propiedades`
      toast.error(`Se cortó después de ${hasta}`, { description: e instanceof Error ? e.message : undefined })
      setProgreso(null)
    }
  }

  const rotulo = progreso
    ? `Importando ${progreso.que} ${progreso.hechas} de ${progreso.total}…`
    : [validas.length ? `${validas.length} propiedades` : '', fotosNuevas.length ? `${fotosNuevas.length} fotos` : ''].filter(Boolean).join(' y ')

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-(--line) bg-(--surface-2) p-3 text-[13px]">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <b>{archivo}</b>
        <span className="text-success">{validas.length} para importar</span>
        {yaEstaban > 0 && <span className="text-(--fg-muted)">{yaEstaban} ya estaban</span>}
        {conError.length > 0 && <span className="text-destructive">{conError.length} con error (no entran)</span>}
      </div>
      {rf && (
        rf.ok ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <b>Fotos</b>
            <span className="text-success">{rf.new} para importar</span>
            {rf.existing > 0 && <span className="text-(--fg-muted)">{rf.existing} ya estaban</span>}
            {rf.invalid > 0 && <span className="text-destructive">{rf.invalid} con error (no entran)</span>}
          </div>
        ) : <span className="text-destructive">Hoja «{HOJA_DE_FOTOS}»: {rf.error}</span>
      )}
      {(conError.length > 0 || fotosConError.length > 0) && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-(--line) bg-card text-[12.5px]">
          {conError.map(f => (
            <li key={`p${f.row_number}`} className="border-b border-(--line) px-2.5 py-1.5 last:border-0">
              <span className="tabular-nums text-(--fg-muted)">Fila {f.row_number}</span> · {f.errors.join(' · ')}
            </li>
          ))}
          {fotosConError.map(f => (
            <li key={`f${f.row_number}`} className="border-b border-(--line) px-2.5 py-1.5 last:border-0">
              <span className="tabular-nums text-(--fg-muted)">Fotos, fila {f.row_number}</span> · {f.errors.join(' · ')}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={(!validas.length && !fotosNuevas.length) || !!progreso} onClick={() => void importar()}>
          {progreso && <Loader2 className="size-4 animate-spin" />}
          {progreso ? rotulo : rotulo ? `Importar ${rotulo}` : 'Nada para importar'}
        </Button>
        <Button size="sm" variant="outline" disabled={!!progreso} onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  )
}
