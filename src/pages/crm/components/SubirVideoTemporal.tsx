import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { supabase } from '@/lib/supabase'
import { URL_VIDEO } from '../../../../supabase/functions/_shared/plantillasEmail.ts'

/* TEMPORAL (18/10/2026): sube el vídeo de los mails al bucket público, a la ruta que ya usa
   `URL_VIDEO`, sea cual sea el nombre del archivo elegido. La edge function `subir-publico` firma
   la subida (solo SUPERADMIN) y el navegador sube directo a Storage. Se borra con la función. */
const RUTA = URL_VIDEO.split('/object/public/publico/')[1]

export function SubirVideoTemporal() {
  const input = useRef<HTMLInputElement>(null)

  const subir = useMutation({
    mutationFn: async (file: File) => {
      const { data, error } = await supabase.functions.invoke<{ path: string; token: string }>('subir-publico', { body: { path: RUTA } })
      if (error) {
        const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
        throw new Error(body?.error ?? error.message)
      }
      if (!data) throw new Error('No se pudo firmar la subida')
      const r = await supabase.storage.from('publico').uploadToSignedUrl(data.path, data.token, file, { contentType: file.type || 'video/mp4', upsert: true })
      if (r.error) throw r.error
    },
    onSuccess: () => toast.success('Vídeo subido', { description: URL_VIDEO }),
    onError: (e: Error) => { toast.error(e.message || 'No se pudo subir el vídeo') },
  })

  return (
    <>
      <Button variant="ghost" disabled={subir.isPending} onClick={() => input.current?.click()} title={`Sube a ${RUTA}`}>
        <Icon icon={UploadIcon} size="xs" />
        {subir.isPending ? 'Subiendo…' : 'Subir vídeo'}
      </Button>
      <input ref={input} type="file" accept="video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) subir.mutate(f); e.target.value = '' }} />
    </>
  )
}
