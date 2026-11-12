import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  type ArchivoDeVideo,
  type Capacitaciones,
  claveDeVideo,
  escribirCapacitaciones,
  escribirVistos,
  ID_CAPACITACIONES,
  idDeVistos,
  leerCapacitaciones,
  leerVistos,
  type Vistos,
} from '../lib/capacitaciones'

/* Las capacitaciones viven en `roadmap_notas`, como las notas de la demo y Claude Toni: sin
   migración, con la RLS por `es_usuario()` que la tabla ya tiene. Ojo: esa RLS deja escribir la
   fila a cualquier usuario activo; que solo un SUPERADMIN edite es solo de pantalla. Y dos
   editando a la vez se pisan: gana el último guardado (se escribe el JSON entero). */
const BUCKET = 'roadmap-adjuntos'
export const CLAVE_CAPACITACIONES = ['crm', 'capacitaciones']
const CLAVE = CLAVE_CAPACITACIONES
const claveVistos = (userId: string | null) => ['crm', 'capacitaciones-vistos', userId]
const TTL_FIRMA = 60 * 60

async function leerFila(id: string): Promise<string> {
  const { data, error } = await supabase.from('roadmap_notas').select('texto').eq('id', id).maybeSingle()
  if (error) throw error
  // Sin fila es «todavía no hay nada», no un error.
  return data?.texto ?? ''
}

async function escribirFila(id: string, texto: string) {
  const { error } = await supabase.from('roadmap_notas').upsert({ id, texto, titulo: '', orden: 0 })
  if (error) throw error
}

export function useCapacitaciones() {
  return useQuery({ queryKey: CLAVE, queryFn: async () => leerCapacitaciones(await leerFila(ID_CAPACITACIONES)) })
}

/* Optimista: cambia al toque y, si la base no lo guarda, vuelve a como estaba y avisa. */
export function useGuardarCapacitaciones() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: Capacitaciones) => escribirFila(ID_CAPACITACIONES, escribirCapacitaciones(c)),
    onMutate: async (c: Capacitaciones) => {
      await qc.cancelQueries({ queryKey: CLAVE })
      const previo = qc.getQueryData<Capacitaciones>(CLAVE)
      qc.setQueryData(CLAVE, c)
      return { previo }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(CLAVE, ctx?.previo)
      toast.error('No se pudieron guardar las capacitaciones')
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CLAVE }) },
  })
}

export function useVistosDeCapacitaciones(userId: string | null) {
  return useQuery({
    queryKey: claveVistos(userId),
    enabled: !!userId,
    queryFn: async () => leerVistos(await leerFila(idDeVistos(userId!))),
  })
}

export function useGuardarVistos(userId: string | null) {
  const qc = useQueryClient()
  const clave = claveVistos(userId)
  return useMutation({
    mutationFn: async (v: Vistos) => {
      if (!userId) throw new Error('sin sesión')
      await escribirFila(idDeVistos(userId), escribirVistos(v))
    },
    onMutate: async (v: Vistos) => {
      await qc.cancelQueries({ queryKey: clave })
      const previo = qc.getQueryData<Vistos>(clave)
      qc.setQueryData(clave, v)
      return { previo }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(clave, ctx?.previo)
      toast.error('No se pudo guardar el visto')
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: clave }) },
  })
}

/* Se firma al dibujar el reproductor, nunca se guarda: una URL firmada vence. */
export function useUrlDeVideo(archivo: ArchivoDeVideo | undefined) {
  return useQuery({
    queryKey: ['crm', 'capacitaciones-firma', archivo?.b, archivo?.path],
    enabled: !!archivo,
    staleTime: (TTL_FIRMA / 2) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(archivo!.b || BUCKET).createSignedUrl(archivo!.path, TTL_FIRMA)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export async function subirVideoDeCapacitacion(archivo: File): Promise<ArchivoDeVideo> {
  const path = claveDeVideo(archivo.name, crypto.randomUUID())
  const { error } = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) throw error
  return { path, b: BUCKET, n: archivo.name, size: archivo.size }
}

/* Lo que no se pudo borrar queda huérfano en el bucket: no frena nada, solo se avisa. */
export async function borrarArchivosDeCapacitacion(archivos: ArchivoDeVideo[]) {
  if (archivos.length === 0) return
  const porBucket = new Map<string, string[]>()
  for (const a of archivos) porBucket.set(a.b || BUCKET, [...(porBucket.get(a.b || BUCKET) ?? []), a.path])
  for (const [b, paths] of porBucket) {
    const { error } = await supabase.storage.from(b).remove(paths)
    if (error) toast.error('El video se sacó, pero el archivo no se pudo borrar del almacenamiento')
  }
}
