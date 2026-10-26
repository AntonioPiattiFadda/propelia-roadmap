import writeExcelFile from 'write-excel-file/browser'

/* El único lugar que escribe Excel: si se cambia de librería, se cambia acá (leer es
   `crm/service/excel.ts`). Descarga una hoja con la primera fila en negrita. */
export async function descargarExcel(nombre: string, filas: string[][]): Promise<void> {
  const [cabecera = [], ...resto] = filas
  await writeExcelFile(
    [cabecera.map(value => ({ value, fontWeight: 'bold' as const })), ...resto.map(f => f.map(value => ({ value, type: String })))],
    { columns: cabecera.map(c => ({ width: Math.max(14, c.length + 4) })) },
  ).toFile(nombre)
}
