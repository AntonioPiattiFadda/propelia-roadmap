import { useRef } from 'react'
import { BookOpenIcon, FileTextIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useCarteras } from '../hooks/useCarteras'
import { useBorrarPlaybook, usePlaybooksSubidos, useSubirPlaybook } from '../hooks/usePlaybook'
import { type ArchivoPlaybook, PLAYBOOKS_FIJOS, pesoLegible } from '../lib/playbook'

/* NUEVO. Los playbooks del SDR a mano en la cabecera del CRM, al lado del planning: se leen
   mientras se llama. Subir puede cualquiera; borrar, solo SUPERADMIN (la RLS del bucket deja a
   cualquier `es_usuario()`, esto es solo para no ofrecerlo). Los de fábrica no se borran. */
export function PlaybookDialog() {
  const { esSuperadmin } = useCarteras()
  const subidos = usePlaybooksSubidos()
  const subir = useSubirPlaybook()
  const borrar = useBorrarPlaybook()
  const input = useRef<HTMLInputElement>(null)

  const alElegir = async (archivos: FileList | null) => {
    for (const archivo of Array.from(archivos ?? [])) {
      try {
        await subir.mutateAsync(archivo)
        toast.success(`«${archivo.name}» subido`)
      } catch {
        toast.error(`No se pudo subir «${archivo.name}»`)
      }
    }
    if (input.current) input.current.value = ''
  }

  const alBorrar = (a: ArchivoPlaybook) => {
    if (!a.path || !window.confirm(`¿Borrar «${a.nombre}»?`)) return
    borrar.mutate(a.path, { onError: () => toast.error('No se pudo borrar') })
  }

  const archivos = [...PLAYBOOKS_FIJOS, ...(subidos.data ?? [])]

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={BookOpenIcon} size="xs" />
          <span className="max-md:hidden">Playbook</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Playbook SDR</DialogTitle>
          <DialogDescription>Los documentos para tener abiertos mientras llamás.</DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {archivos.map(a => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <Icon icon={FileTextIcon} size="sm" className="shrink-0 text-blue-600" />
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground hover:underline"
                title={a.nombre}
              >
                {a.nombre}
              </a>
              {a.peso != null && <span className="shrink-0 text-[12px] tabular-nums text-(--fg-muted)">{pesoLegible(a.peso)}</span>}
              {esSuperadmin && a.path && (
                <Button variant="ghost" size="icon" aria-label={`Borrar ${a.nombre}`} onClick={() => alBorrar(a)}>
                  <Icon icon={Trash2Icon} size="xs" />
                </Button>
              )}
            </li>
          ))}
          {subidos.isLoading && <li className="px-3 py-2 text-[12.5px] text-(--fg-muted)">Cargando los subidos…</li>}
          {subidos.isError && <li className="px-3 py-2 text-[12.5px] text-red-600">No se pudieron leer los archivos subidos.</li>}
        </ul>

        <input ref={input} type="file" multiple className="hidden" onChange={e => alElegir(e.target.files)} />
        <Button variant="outline" disabled={subir.isPending} onClick={() => input.current?.click()} className="self-start">
          <Icon icon={UploadIcon} size="xs" />
          {subir.isPending ? 'Subiendo…' : 'Subir archivo'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
