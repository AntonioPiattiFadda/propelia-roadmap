import { readSheet } from 'read-excel-file/browser'
import type { Celda } from '../lib/importarLote'

/* El único lugar que sabe de read-excel-file: si se cambia de librería, se cambia acá. Lee la
   primera hoja (el BCN-S01 trae una sola) tal cual, sin interpretar nada: eso es de `leerLote()`. */
export async function leerPrimeraHoja(archivo: File): Promise<Celda[][]> {
  return (await readSheet(archivo)) as Celda[][]
}
