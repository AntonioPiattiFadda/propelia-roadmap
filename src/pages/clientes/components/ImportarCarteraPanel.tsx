import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FILAS_POR_LOTE, importarLoteDeCartera, PUENTE_SIMULADO, revisarCartera, type FilaRevisada } from '../service/puente'
import { useMarcarTarea } from '../hooks/useClientes'
import { claveDeTarea } from '../lib/pasos'
import type { DatosDelAlta } from './datosDelAlta'

type Revision = { estado: 'revisando' } | { estado: 'error'; error: string } | { estado: 'lista'; filas: FilaRevisada[] }

/* El import de la cartera (paso 2), como en el producto: el Excel se lee acá (celdas crudas, sin
   interpretar) y el producto lo revisa (`check_properties`) y lo importa en lotes de 50
   (`import_properties`), completando las direcciones con Google. Las filas con error no se
   importan; las que ya estaban en la org (mismo código de Idealista) se saltean. Al terminar se
   tilda «Importar la cartera». */
export function ImportarCarteraPanel({ datos, archivo, hoja, onCerrar }: {
  datos: DatosDelAlta; archivo: string; hoja: string[][]; onCerrar: () => void
}) {
  const [revision, setRevision] = useState<Revision>({ estado: 'revisando' })
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null)
  const marcar = useMarcarTarea()
  const orgId = datos.orgId!

  useEffect(() => {
    let vivo = true
    revisarCartera(orgId, hoja)
      .then(r => vivo && setRevision(r.ok ? { estado: 'lista', filas: r.rows } : { estado: 'error', error: r.error }))
      .catch(e => vivo && setRevision({ estado: 'error', error: e instanceof Error ? e.message : 'No se pudo revisar' }))
    return () => { vivo = false }
  }, [orgId, hoja])

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

  const importar = async () => {
    const [cabecera, ...filas] = hoja
    const porNumero = new Map(filas.map((f, i) => [i + 2, f]))
    let creadas = 0
    setProgreso({ hechas: 0, total: validas.length })
    try {
      for (let i = 0; i < validas.length; i += FILAS_POR_LOTE) {
        const lote = validas.slice(i, i + FILAS_POR_LOTE).map(f => ({ row_number: f.row_number, cells: porNumero.get(f.row_number) ?? [] }))
        const res = await importarLoteDeCartera(orgId, cabecera, lote)
        creadas += res.filter(r => r.status === 'created').length
        setProgreso({ hechas: Math.min(i + FILAS_POR_LOTE, validas.length), total: validas.length })
      }
      marcar.mutate({ onboardingId: datos.o.id, taskId: claveDeTarea('cartera-org-pago', 'importar'), hecha: true })
      toast.success(`${creadas} propiedades importadas`, PUENTE_SIMULADO ? { description: 'Puente simulado: en Propelia no se creó nada todavía.' } : undefined)
      onCerrar()
    } catch (e) {
      // Cada lote es todo o nada: lo creado hasta acá quedó, se puede volver a subir y se saltea.
      toast.error(`Se cortó después de ${creadas} propiedades`, { description: e instanceof Error ? e.message : undefined })
      setProgreso(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-(--line) bg-(--surface-2) p-3 text-[13px]">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <b>{archivo}</b>
        <span className="text-success">{validas.length} para importar</span>
        {yaEstaban > 0 && <span className="text-(--fg-muted)">{yaEstaban} ya estaban</span>}
        {conError.length > 0 && <span className="text-destructive">{conError.length} con error (no entran)</span>}
      </div>
      {conError.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-(--line) bg-card text-[12.5px]">
          {conError.map(f => (
            <li key={f.row_number} className="border-b border-(--line) px-2.5 py-1.5 last:border-0">
              <span className="tabular-nums text-(--fg-muted)">Fila {f.row_number}</span> · {f.errors.join(' · ')}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!validas.length || !!progreso} onClick={() => void importar()}>
          {progreso && <Loader2 className="size-4 animate-spin" />}
          {progreso ? `Importando ${progreso.hechas} de ${progreso.total}…` : `Importar ${validas.length} propiedades`}
        </Button>
        <Button size="sm" variant="outline" disabled={!!progreso} onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  )
}
