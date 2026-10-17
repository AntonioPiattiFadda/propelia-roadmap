/* NUEVO. Los playbooks del SDR: los dos de fábrica viven en `public/playbook/` (van con el
   deploy) y los que se suben, en el bucket `roadmap-adjuntos` bajo `playbook/`. El bucket ya
   existe con su RLS por `es_usuario()`, así que no hizo falta migración. */

export const CARPETA_PLAYBOOK = 'playbook'

export type ArchivoPlaybook = {
  id: string
  nombre: string
  url: string
  /** null en los de fábrica: no se borran desde la pantalla. */
  path: string | null
  peso: number | null
}

export const PLAYBOOKS_FIJOS: ArchivoPlaybook[] = [
  { id: 'fijo-playbook', nombre: 'Playbook SDR Propelia', url: '/playbook/playbook-sdr-propelia.pdf', path: null, peso: 109_294 },
  { id: 'fijo-anexo', nombre: 'Anexo · Playbook SDR Propelia', url: '/playbook/anexo-playbook-sdr-propelia.pdf', path: null, peso: 80_574 },
]

const SEPARADOR = '__'

/* Supabase valida las claves con un regex ASCII: «Guión.pdf» falla la subida entera con 400.
   El momento adelante evita pisar un archivo con el mismo nombre. */
export function clavePlaybook(nombre: string, ahora: number): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
  return `${CARPETA_PLAYBOOK}/${ahora}${SEPARADOR}${limpio}`
}

export function nombreDeClave(nombreEnBucket: string): string {
  const i = nombreEnBucket.indexOf(SEPARADOR)
  const sinMomento = i >= 0 && /^\d+$/.test(nombreEnBucket.slice(0, i))
    ? nombreEnBucket.slice(i + SEPARADOR.length)
    : nombreEnBucket
  return sinMomento.replace(/_/g, ' ')
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
