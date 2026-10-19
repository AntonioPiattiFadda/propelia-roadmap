import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { RotateCcw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { cn } from '@/lib/utils'
import {
  nombreEnBandeja, PLANTILLAS_EMAIL, predeterminadosPara, whatsappDe, problemaDeCampos, remitenteDe, renderEmail, ROTULOS_CAMPOS,
  type CampoEmail, type CamposEmail, type PlantillaEmailId, type Remitente,
} from '../../../../supabase/functions/_shared/plantillasEmail.ts'
import { sendEmail } from '../service/email.service'
import type { CrmClient } from '../types'

/* La pestaña Email de «Mensajes» (18/10/2026): las dos plantillas HTML de `_shared/plantillasEmail.ts`,
   con el texto precargado y editable antes de mandar. Lo editado vale para ese envío y nada más:
   cambiar de plantilla o cerrar vuelve al texto de fábrica. La vista previa es el mismo
   `renderEmail` que arma el mail en el servidor, así que lo que se ve es lo que sale. Va en una
   tercera columna y se rearma con cada tecla: editar a ciegas y alternar para mirar era el doble
   de clics por cada cambio. En pantallas angostas cae debajo de los campos.
   La firma y los datos de contacto son los de quien está logueado (`firma_*` de `users`): la
   vista previa los lee de `useYo` y el servidor los vuelve a leer de la base al mandar. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MULTILINEA: Partial<Record<CampoEmail, { filas: number; ayuda?: string }>> = {
  cuerpo: { filas: 5, ayuda: 'Una línea en blanco separa párrafos.' },
  puntos: { filas: 5, ayuda: 'Una tarjeta por renglón; hasta el primer punto va en negrita.' },
  notaBoton: { filas: 2 },
}

const ETIQUETA = 'text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)'

function emailsDe(client: CrmClient | null): string[] {
  if (!client) return []
  return [...new Set([client.email, client.alternative_phone_1_email, client.alternative_phone_2_email]
    .map(e => e?.trim() ?? '').filter(Boolean))]
}

const camposIniciales = (id: PlantillaEmailId, client: CrmClient | null, remitente: Remitente): CamposEmail => ({
  ...predeterminadosPara(id, remitente, { nombre: client?.first_name, empresa: client?.company_name }),
  nombre: client?.first_name?.trim() ?? '',
})

/** La lista de la izquierda: las dos plantillas. */
export function ListaDePlantillasEmail({ elegida, onElegir }: { elegida: PlantillaEmailId; onElegir: (id: PlantillaEmailId) => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {PLANTILLAS_EMAIL.map(p => (
        <li key={p.id}>
          <button type="button" onClick={() => onElegir(p.id)}
            className={cn('flex w-full cursor-pointer flex-col rounded-lg px-2.5 py-2 text-left transition-colors',
              elegida === p.id ? 'bg-card [box-shadow:0_0_0_1px_var(--line)]' : 'hover:bg-card/60')}>
            <span className="truncate text-[13px] font-semibold text-foreground">{p.nombre}</span>
            <span className="line-clamp-2 text-[12px] leading-snug text-(--fg-muted)">{p.descripcion}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** El lado derecho: para quién y los campos editables, la vista previa al lado, y «Enviar». Se monta con
    `key` por plantilla, así que cambiar de plantilla arranca de cero. */
export function EmailConPlantilla({ id, client }: { id: PlantillaEmailId; client: CrmClient | null }) {
  const plantilla = PLANTILLAS_EMAIL.find(p => p.id === id)!
  const conocidos = useMemo(() => emailsDe(client), [client])
  const [para, setPara] = useState(conocidos[0] ?? '')
  // La fila de `users` ya la trajo el guard de acceso: al montar está en caché.
  const { userSession } = useUserSession()
  const yo = useYo(userSession?.user.id).data
  const remitente = useMemo(() => remitenteDe(yo), [yo])
  const [campos, setCampos] = useState<CamposEmail>(() => camposIniciales(id, client, remitente))

  /* El enlace del botón (WhatsApp, en los dos mails) se rearma solo mientras nadie lo edite a mano: con el teléfono
     de quien manda (la fila de `users` puede llegar después de abrir, y entonces el enlace quedaba
     en un mailto a info@) y con el nombre que se escriba en «Nombre». */
  const [botonTocado, setBotonTocado] = useState(false)
  const empresa = client?.company_name
  useEffect(() => {
    if (botonTocado) return
    const url = whatsappDe(remitente, { nombre: campos.nombre, empresa }, id)
    setCampos(c => (c.urlBoton === url ? c : { ...c, urlBoton: url }))
  }, [id, botonTocado, remitente, campos.nombre, empresa])
  /* `<base target="_blank">`: en la vista previa los enlaces se prueban como en el mail (el botón de
     WhatsApp, el vídeo, la firma), pero en una pestaña nueva y no adentro del iframe. Solo va en la
     vista previa: el mail que sale lo arma el servidor sin esto. */
  const html = useMemo(() => renderEmail(id, campos, remitente, { assets: `${window.location.origin}/email` }).html
    .replace('<head>', '<head><base target="_blank">'), [id, campos, remitente])

  /* El iframe recarga el documento entero con cada `srcDoc` nuevo y queda en blanco hasta el `load`
     (que espera las imágenes). Por eso se le pasa recién cuando se deja de tipear, y mientras
     carga hay una barra al medio. El tope de 8 s es por si el `load` no llega: la barra no puede
     quedar tapando la vista previa para siempre. */
  const [htmlEnVista, setHtmlEnVista] = useState(html)
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    if (html === htmlEnVista) return
    const t = setTimeout(() => { setHtmlEnVista(html); setCargando(true) }, 350)
    return () => clearTimeout(t)
  }, [html, htmlEnVista])
  useEffect(() => {
    if (!cargando) return
    const t = setTimeout(() => setCargando(false), 8000)
    return () => clearTimeout(t)
  }, [cargando, htmlEnVista])
  const problema = !EMAIL.test(para.trim()) ? 'Falta una casilla válida en «Para»' : problemaDeCampos(id, campos)

  const enviar = useMutation({
    mutationFn: () => sendEmail({ to: para.trim(), plantilla: id, campos }),
    onSuccess: () => toast.success(`«${plantilla.nombre}» enviado a ${para.trim()}`),
    onError: (e: Error) => { toast.error(e.message || 'No se pudo enviar el email') },
  })

  const cambiar = (k: CampoEmail, v: string) => {
    if (k === 'urlBoton') setBotonTocado(true)
    setCampos(c => ({ ...c, [k]: v }))
  }

  return (
    <>
      <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_640px] xl:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-3 p-4 xl:min-h-0 xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[14px] font-semibold">{plantilla.nombre}</h3>
          <button type="button" onClick={() => { setBotonTocado(false); setCampos(camposIniciales(id, client, remitente)) }} title="Volver al texto de la plantilla"
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
            <RotateCcw size={13} />Restablecer
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={ETIQUETA}>Para</span>
          <Input type="email" value={para} placeholder="casilla@inmobiliaria.com" onChange={e => setPara(e.target.value)}
            className="h-9 text-[13px] md:text-[13px]" />
          {conocidos.length > 1 && (
            <span className="flex flex-wrap gap-1">
              {conocidos.map(e => (
                <button key={e} type="button" onClick={() => setPara(e)}
                  className={cn('cursor-pointer rounded-md px-1.5 py-0.5 text-[11.5px]',
                    para.trim() === e ? 'bg-foreground text-background' : 'bg-(--surface-2) text-(--fg-2) hover:text-foreground')}>{e}</button>
              ))}
            </span>
          )}
        </label>

        {plantilla.editables.map(k => {
            const multi = MULTILINEA[k]
            return (
              <label key={k} className="flex flex-col gap-1">
                <span className={ETIQUETA}>{ROTULOS_CAMPOS[k]}</span>
                {multi ? (
                  <Textarea rows={multi.filas} value={campos[k]} onChange={e => cambiar(k, e.target.value)}
                    className="resize-y text-[13px] md:text-[13px]" />
                ) : (
                  <Input value={campos[k]} onChange={e => cambiar(k, e.target.value)}
                    placeholder={k === 'urlVideo' || k === 'urlBoton' ? 'https://…' : undefined}
                    className="h-9 text-[13px] md:text-[13px]" />
                )}
                {multi?.ayuda && <span className="text-[11.5px] text-(--fg-muted)">{multi.ayuda}</span>}
              </label>
            )
          })}
      </div>

      {/* La vista previa: 640px son los 600 del mail más su margen, así se ve como en el escritorio. */}
      <div className="flex min-w-0 flex-col gap-1.5 bg-(--surface-2) p-3 max-xl:[border-top:1px_solid_var(--line)] xl:min-h-0 xl:[border-left:1px_solid_var(--line)]">
        <span className={cn(ETIQUETA, 'px-1')}>Vista previa</span>
        <div className="relative h-[70vh] w-full overflow-hidden rounded-lg bg-white [border:1px_solid_var(--line)] xl:h-auto xl:min-h-0 xl:flex-1">
          <iframe title="Vista previa del email" srcDoc={htmlEnVista}
            // Sin scripts; solo abrir enlaces en otra pestaña, y que esa pestaña no herede el sandbox.
            sandbox="allow-popups allow-popups-to-escape-sandbox" onLoad={() => setCargando(false)}
            className="absolute inset-0 size-full" />
          {cargando && (
            <div role="progressbar" aria-label="Cargando la vista previa"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/80">
              <style>{'@keyframes barra-vista-previa{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}'}</style>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-(--surface-2)">
                <div className="h-full w-2/5 rounded-full bg-[#0147FE] animate-[barra-vista-previa_1.1s_ease-in-out_infinite]" />
              </div>
              <span className="text-[12px] font-medium text-(--fg-muted)">Cargando vista previa…</span>
            </div>
          )}
        </div>
      </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 px-4 py-3 [border-top:1px_solid_var(--line)]">
        {problema && <span className="min-w-0 truncate text-[12px] text-(--fg-muted)">{problema}</span>}
        <span className="hidden text-[12px] text-(--fg-muted) md:inline">{problema ? '' : `Llega de «${nombreEnBandeja(remitente)}» <info@propelia.es>`}</span>
        <button type="button" onClick={() => enviar.mutate()} disabled={!!problema || enviar.isPending}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          <Send size={14} />{enviar.isPending ? 'Enviando…' : 'Enviar email'}
        </button>
      </footer>
    </>
  )
}
