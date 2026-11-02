import readXlsxFile, { readSheet } from 'read-excel-file/browser'
import type { Celda } from '../lib/importarLote'

/* El único lugar que sabe de read-excel-file: si se cambia de librería, se cambia acá. Lee la
   primera hoja (el BCN-S01 trae una sola) tal cual, sin interpretar nada: eso es de `leerLote()`. */
export async function leerPrimeraHoja(archivo: File): Promise<Celda[][]> {
  return (await readSheet(archivo)) as Celda[][]
}

/* La primera hoja y, si existe, la que se llama `nombre` (sin mayúsculas ni espacios de más que
   importen): el Excel de la cartera trae las fotos en una hoja «Fotos». */
export async function leerHojaYOtra(archivo: File, nombre: string): Promise<{ primera: Celda[][]; otra: Celda[][] | null }> {
  const hojas = (await readXlsxFile(archivo)) as { sheet: string; data: Celda[][] }[]
  const igual = (s: string) => s.trim().toLowerCase() === nombre.trim().toLowerCase()
  return { primera: hojas[0]?.data ?? [], otra: hojas.find(h => igual(h.sheet))?.data ?? null }
}
