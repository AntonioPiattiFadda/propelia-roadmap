import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PROPERTY_TYPE_LABELS } from '@/lib/propertyTypeLabels'
import { cn } from '@/lib/utils'
import {
  importProperties,
  type ImportProgress,
  type ImportRowResult,
} from '@/service/propertyImport.service'
import {
  buildImportAddressPayload,
  buildImportPropertyPayload,
  IMPORT_COLUMNS,
  parseSheet,
  type Cell,
  type ParsedImportRow,
} from './importRows'

const TEMPLATE_FILE_NAME = 'plantilla-propiedades.xlsx'

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'error desconocido')

const formatPrice = (s: string) => (s ? `${Number(s).toLocaleString('es-ES')} €` : '')

/** Las librerías de Excel se cargan recién al usarlas: no pesan en el bundle del resto de la app. */
async function downloadTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(
    [
      IMPORT_COLUMNS.map(c => ({ value: c.header, fontWeight: 'bold' as const })),
      IMPORT_COLUMNS.map(c => c.example),
    ],
    { columns: IMPORT_COLUMNS.map(() => ({ width: 22 })) },
  ).toFile(TEMPLATE_FILE_NAME)
}

async function readExcel(file: File): Promise<Cell[][]> {
  const { readSheet } = await import('read-excel-file/browser')
  return (await readSheet(file)) as Cell[][]
}

/**
 * Onboarding › Cargar la cartera: importa las propiedades de la inmobiliaria desde un Excel a
 * la organización vinculada al onboarding. Sólo superadmin (la página cuelga de
 * RequireSuperadmin y el RPC `superadmin_import_properties` lo vuelve a exigir).
 *
 * Las propiedades nacen sin captador ni comercializador: se asignan cuando la org tenga a su
 * equipo. El código de Idealista es lo que vincula los leads que llegan por mail; el RPC además
 * vincula los que ya habían llegado esperando ese código.
 */
export function PropertyImport({ organizationId, agencyName }: { organizationId: string | null; agencyName: string }) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedImportRow[] | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [results, setResults] = useState<ImportRowResult[] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const validRows = (rows ?? []).filter(r => r.errors.length === 0)
  const invalidCount = (rows?.length ?? 0) - validRows.length

  const reset = () => {
    setRows(null)
    setSheetError(null)
    setResults(null)
    setFileName(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    reset()
    setFileName(file.name)
    try {
      const parsed = parseSheet(await readExcel(file))
      if (parsed.ok) setRows(parsed.rows)
      else setSheetError(parsed.error)
    } catch (e) {
      setSheetError(`No se pudo leer el archivo: ${errorMessage(e)}`)
    }
  }

  const template = useMutation({
    mutationFn: downloadTemplate,
    onError: (e) => toast.error(`No se pudo generar la plantilla: ${errorMessage(e)}`),
  })

  const run = useMutation({
    mutationFn: () =>
      importProperties(
        organizationId!,
        validRows.map(r => ({ property: buildImportPropertyPayload(r), address: buildImportAddressPayload(r) })),
        setProgress,
      ),
    onSuccess: (res) => {
      setResults(res)
      const created = res.filter(r => r.status === 'created').length
      toast.success(`${created} propiedades creadas en ${agencyName}`)
    },
    onError: (e) => toast.error(`No se pudo importar: ${errorMessage(e)}`),
    onSettled: () => setProgress(null),
  })

  const resultByRow = new Map<number, ImportRowResult>()
  if (results) validRows.forEach((r, i) => resultByRow.set(r.rowNumber, results[i]))
  const created = results?.filter(r => r.status === 'created') ?? []
  const skipped = results?.filter(r => r.status === 'skipped_existing').length ?? 0
  const linkedLeads = created.reduce((n, r) => n + (r.status === 'created' ? r.linked_leads : 0), 0)

  if (!organizationId) {
    return (
      <p className="text-xs text-muted-foreground">
        Primero vinculá la organización del cliente (paso «Usuarios y cuentas»): las propiedades se crean ahí.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Columnas: {IMPORT_COLUMNS.map(c => c.header).join(' · ')}. Son los campos de la carga rápida más
          el código del anuncio de Idealista.
        </p>
        <Button variant="outline" size="sm" onClick={() => template.mutate()} disabled={template.isPending}>
          <Icon icon={Download} size="sm" />
          Descargar plantilla
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={e => onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={run.isPending}
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-(--line) px-4 py-8 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon icon={fileName ? FileSpreadsheet : Upload} size="lg" />
        {fileName ? <span className="font-medium text-foreground">{fileName}</span> : 'Elegí el Excel (.xlsx)'}
        {fileName && <span>Hacé clic para cambiarlo</span>}
      </button>

      {sheetError && (
        <p className="flex items-center gap-2 rounded-lg bg-(--danger-soft) px-3 py-2 text-xs text-(--danger)">
          <Icon icon={XCircle} size="sm" />
          {sheetError}
        </p>
      )}

      {rows && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs">
              <span className="font-semibold">{validRows.length}</span> listas para importar
              {invalidCount > 0 && (
                <> · <span className="font-semibold text-(--danger)">{invalidCount}</span> con errores (no se importan)</>
              )}
            </p>
            {!results && (
              <Button
                size="sm"
                onClick={() => run.mutate()}
                disabled={validRows.length === 0 || run.isPending}
              >
                {progress
                  ? progress.step === 'addresses'
                    ? `Completando direcciones ${progress.done}/${progress.total}…`
                    : `Guardando ${progress.done}/${progress.total}…`
                  : `Importar ${validRows.length} en ${agencyName}`}
              </Button>
            )}
          </div>

          {results && (
            <p className="flex items-center gap-2 rounded-lg bg-(--success-soft) px-3 py-2 text-xs text-(--success)">
              <Icon icon={CheckCircle2} size="sm" />
              {created.length} creadas
              {skipped > 0 && ` · ${skipped} salteadas porque ese código ya estaba en la organización`}
              {linkedLeads > 0 && ` · ${linkedLeads} leads que esperaban su anuncio quedaron vinculados`}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-(--line)">
            <table className="w-full text-xs">
              <thead className="bg-(--surface-2) text-left text-(--fg-muted)">
                <tr>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Código Idealista</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Dirección</th>
                  <th className="px-3 py-2 font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <ImportRow key={r.rowNumber} row={r} result={resultByRow.get(r.rowNumber)} />
                ))}
              </tbody>
            </table>
          </div>

          {results && (
            <div>
              <Button variant="outline" size="sm" onClick={reset}>Importar otro Excel</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ImportRow({ row, result }: { row: ParsedImportRow; result: ImportRowResult | undefined }) {
  const ib = row.form.infoBasica
  const address = [[ib.street, ib.street_number].filter(Boolean).join(' '), ib.city].filter(Boolean).join(', ')
  const price = [ib.for_sale && formatPrice(ib.sale_price), ib.for_rent && `${formatPrice(ib.rent_price)}/mes`]
    .filter(Boolean)
    .join(' · ')

  return (
    <tr className={cn('border-t border-(--line) align-top', row.errors.length > 0 && 'bg-(--danger-soft)/40')}>
      <td className="px-3 py-2 text-(--fg-muted)">{row.rowNumber}</td>
      <td className="px-3 py-2 font-mono">{row.idealistaCode ?? '—'}</td>
      <td className="px-3 py-2">{PROPERTY_TYPE_LABELS[ib.property_type] ?? '—'}</td>
      <td className="px-3 py-2">{address || '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">{price || '—'}</td>
      <td className="px-3 py-2">
        <RowStatus row={row} result={result} />
      </td>
    </tr>
  )
}

function RowStatus({ row, result }: { row: ParsedImportRow; result: ImportRowResult | undefined }) {
  if (row.errors.length > 0) {
    return (
      <ul className="flex flex-col gap-0.5 text-(--danger)">
        {row.errors.map(e => <li key={e}>{e}</li>)}
      </ul>
    )
  }
  if (result?.status === 'created') {
    return (
      <span className="text-(--success)">
        Creada{result.linked_leads > 0 && ` · ${result.linked_leads} leads vinculados`}
      </span>
    )
  }
  if (result?.status === 'skipped_existing') {
    return <span className="text-(--warning)">Salteada: ese código ya estaba en la organización</span>
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-(--success)">Lista</span>
      {row.warnings.map(w => (
        <span key={w} className="flex items-start gap-1 text-(--warning)">
          <Icon icon={AlertTriangle} size="xs" className="mt-0.5" />
          {w}
        </span>
      ))}
    </div>
  )
}
