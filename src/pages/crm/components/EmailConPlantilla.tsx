import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, Loader2, MailX, Paperclip, Pencil, RotateCcw, Save, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { VerEmail } from '@/components/EmailPreviewDialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { cn } from '@/lib/utils'
import {
  conGuardada, nombreEnBandeja, PLANTILLAS_EMAIL, predeterminadosPara, whatsappDe, problemaDeCampos, remitenteDe, renderEmail, ROTULOS_CAMPOS,
  type CampoEmail, type CamposEmail, type PlantillaEmailId, type Remitente,
} from '../../../../supabase/functions/_shared/plantillasEmail.ts'
import { base64Size, fileToAttachment, guardarPlantilla, MAX_ATTACHMENTS_BYTES, sendEmail } from '../service/email.service'
import { useEstadoDeEnvio, usePlantillasGuardadas } from '../hooks/useEmails'
import { CRM_KEYS } from '../hooks/keys'
import { estadoDelEnvio, motivoLegible } from '../lib/emails'
import type { CrmClient } from '../types'

/* La pestaña Email de «Mensajes» (18/10/2026): las dos plantillas HTML de `_shared/plantillasEmail.ts`,
   con el texto precargado y editable antes de mandar. El texto precargado es la plantilla del equipo
   (`crm_email_plantillas`). Desde el 21/11/2026 lo editado antes de mandar vale solo para ese envío;
   la plantilla se cambia con «Editar plantilla». Sin nada guardado, el texto de fábrica. «Ver email»
   muestra el mismo `renderEmail` que arma el mail en el servidor, así que lo que se ve es lo que sale.
   Desde el 21/11/2026 (por pedido) no hay vista previa fija al costado: los campos ocupan todo el
   ancho y el mail se ve solo al pedirlo.
   La firma y los datos de contacto son los de quien está logueado (`firma_*` de `users`): la
   vista previa los lee de `useYo` y el servidor los vuelve a leer de la base al mandar. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MULTILINEA: Partial<Record<CampoEmail, { filas: number; ayuda?: string }>> = {
  cuerpo: { filas: 10, ayuda: 'Una línea en blanco separa párrafos.' },
  puntos: { filas: 7, ayuda: 'Una tarjeta por renglón; hasta el primer punto va en negrita.' },
  notaBoton: { filas: 3 },
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const ETIQUETA = 'text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)'

function emailsDe(client: CrmClient | null): string[] {
  if (!client) return []
  return [...new Set([client.email, client.alternative_phone_1_email, client.alternative_phone_2_email]
    .map(e => e?.trim() ?? '').filter(Boolean))]
}

const camposIniciales = (id: PlantillaEmailId, client: CrmClient | null, remitente: Remitente, guardada: unknown): CamposEmail => ({
  ...conGuardada(id, predeterminadosPara(id, remitente, { nombre: client?.first_name, empresa: client?.company_name }), guardada),
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
export function EmailConPlantilla({ id, client, leadId, onEnviado, paraInicial }: {
  id: PlantillaEmailId; client: CrmClient | null; leadId?: string
  /** Con el mail ya en Resend: `MensajesPredeterminados` pregunta si se asienta en la actividad. */
  onEnviado?: (envio: { plantilla: string; destino: string }) => void
  /** El «Para» de entrada, aunque no esté cargado en el perfil (el mail del decisor, 18/11/2026). */
  paraInicial?: string
}) {
  const plantilla = PLANTILLAS_EMAIL.find(p => p.id === id)!
  const conocidos = useMemo(() => emailsDe(client), [client])
  const [para, setPara] = useState(paraInicial?.trim() || conocidos[0] || '')
  // La fila de `users` ya la trajo el guard de acceso: al montar está en caché.
  const { userSession } = useUserSession()
  const yo = useYo(userSession?.user.id).data
  const remitente = useMemo(() => remitenteDe(yo), [yo])
  const qc = useQueryClient()
  const guardadas = usePlantillasGuardadas()
  const guardada = guardadas.data?.[id]
  const [campos, setCampos] = useState<CamposEmail>(() => camposIniciales(id, client, remitente, guardada))
  /* Lo guardado puede llegar después de abrir: si todavía no se tocó nada, se carga entonces. */
  const [editado, setEditado] = useState(false)
  useEffect(() => {
    if (editado || guardada === undefined) return
    setCampos(c => ({ ...camposIniciales(id, client, remitente, guardada), urlBoton: c.urlBoton }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega lo guardado
  }, [guardada])

  /* El enlace del botón (WhatsApp, en los dos mails) se rearma solo mientras nadie lo edite a mano: con el teléfono
     de quien manda (la fila de `users` puede llegar después de abrir, y entonces el enlace quedaba
     en un mailto a info@) y con el nombre que se escriba en «Nombre». */
  const conBotonPropio = (g: unknown) => !!g && typeof g === 'object' && typeof (g as Record<string, unknown>).urlBoton === 'string'
  const [botonTocado, setBotonTocado] = useState(() => conBotonPropio(guardada))
  useEffect(() => { if (!editado && conBotonPropio(guardada)) setBotonTocado(true) }, [editado, guardada])
  const empresa = client?.company_name
  useEffect(() => {
    if (botonTocado) return
    const url = whatsappDe(remitente, { nombre: campos.nombre, empresa }, id)
    setCampos(c => (c.urlBoton === url ? c : { ...c, urlBoton: url }))
  }, [id, botonTocado, remitente, campos.nombre, empresa])
  /* Los adjuntos (solo el «Mail puntual», `adjuntos` de la plantilla): valen para este envío, como
     el texto. No salen en la vista previa, que es el HTML del mail. */
  const [archivos, setArchivos] = useState<File[]>([])
  const elegirArchivo = useRef<HTMLInputElement>(null)
  const sumarArchivos = (lista: FileList | null) => {
    /* Se copian ya: el `value = ''` de abajo vacía el mismo `FileList`, y el updater de React corre
       después. Copiándolos adentro del updater, la lista quedaba vacía. */
    const nuevos = Array.from(lista ?? [])
    if (nuevos.length) setArchivos(prev => [...prev, ...nuevos])
    // Si no, elegir otra vez el mismo archivo después de sacarlo no dispara `onChange`.
    if (elegirArchivo.current) elegirArchivo.current.value = ''
  }
  const pesados = archivos.reduce((n, f) => n + base64Size(f.size), 0) > MAX_ATTACHMENTS_BYTES

  const problema = !EMAIL.test(para.trim()) ? 'Falta una casilla válida en «Para»'
    : pesados ? 'Los adjuntos pasan los 10MB' : problemaDeCampos(id, campos)

  const enviar = useMutation({
    mutationFn: async () => sendEmail({
      to: para.trim(), plantilla: id, campos, leadId,
      ...(archivos.length ? { attachments: await Promise.all(archivos.map(fileToAttachment)) } : {}),
    }),
    onSuccess: () => {
      toast.success(`«${plantilla.nombre}» enviado a ${para.trim()}`)
      setArchivos([])
      // Since 21/11/2026 sending does not touch the template: the edits were for this email only.
      onEnviado?.({ plantilla: plantilla.nombre, destino: para.trim() })
    },
    onError: (e: Error) => { toast.error(e.message || 'No se pudo enviar el email') },
  })

  const cambiar = (k: CampoEmail, v: string) => {
    if (k === 'urlBoton') setBotonTocado(true)
    setEditado(true)
    setCampos(c => ({ ...c, [k]: v }))
  }

  const restablecer = (g: unknown) => {
    setBotonTocado(conBotonPropio(g)); setEditado(false); setCampos(camposIniciales(id, client, remitente, g))
  }

  /* «Editar plantilla» (21/11/2026, by request): the same fields, but they edit the team template
     that every email starts from. The draft of this email is kept aside and comes back on cancel. */
  const [editandoPlantilla, setEditandoPlantilla] = useState(false)
  const borrador = useRef<{ campos: CamposEmail; editado: boolean; botonTocado: boolean } | null>(null)
  const abrirEdicionDePlantilla = () => {
    borrador.current = { campos, editado, botonTocado }
    restablecer(guardada)
    setEditandoPlantilla(true)
  }
  const cerrarEdicionDePlantilla = () => {
    const b = borrador.current
    if (b) { setCampos(b.campos); setEditado(b.editado); setBotonTocado(b.botonTocado) }
    setEditandoPlantilla(false)
  }
  const guardar = useMutation({
    mutationFn: () => guardarPlantilla(id, campos, userSession!.user.id),
    onSuccess: async () => {
      toast.success(`Plantilla «${plantilla.nombre}» guardada`)
      await qc.invalidateQueries({ queryKey: CRM_KEYS.plantillasGuardadas })
      const nueva = qc.getQueryData<Partial<Record<PlantillaEmailId, unknown>>>(CRM_KEYS.plantillasGuardadas)?.[id]
      // An untouched draft follows the new template; one already edited stays as it was.
      if (borrador.current?.editado) cerrarEdicionDePlantilla()
      else { restablecer(nueva); setEditandoPlantilla(false) }
    },
    onError: (e: Error) => { toast.error(e.message || 'No se pudo guardar la plantilla') },
  })
  const problemaDePlantilla = problemaDeCampos(id, campos)

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
            {editandoPlantilla ? `Editando la plantilla «${plantilla.nombre}»` : plantilla.nombre}
          </h3>
          {/* Hidden by default (21/11/2026, by request): the fields get the whole width and the
              email shows up only when asked for, with subject and inbox (from, to). */}
          <VerEmail className="text-[12.5px]"
            render={() => renderEmail(id, campos, remitente, { assets: `${window.location.origin}/email` })}
            title={`Así le llega «${plantilla.nombre}»`}
            description="Con el texto de los campos y tu firma: es el mismo HTML que arma el servidor al enviar. Los adjuntos no se ven."
            from={`${nombreEnBandeja(remitente)} <info@propelia.es>`}
            to={para.trim() || 'Falta la casilla en «Para»'} />
          {!editandoPlantilla && (
            <>
              <button type="button" onClick={() => restablecer(guardada)}
                title="Volver al texto de la plantilla"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
                <RotateCcw size={13} />Restablecer
              </button>
              <button type="button" onClick={abrirEdicionDePlantilla}
                title="Cambiar el texto con el que arranca este mail, para todo el equipo"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
                <Pencil size={13} />Editar plantilla
              </button>
            </>
          )}
        </div>

        {editandoPlantilla ? (
          <p className="rounded-lg bg-(--surface-2) px-3 py-2 text-[12.5px] text-(--fg-2)">
            Lo que guardes acá es el texto con el que arranca este mail para todo el equipo. Lo que cambies antes
            de enviar un mail vale solo para ese envío. El nombre del lead y el WhatsApp de quien manda se ponen solos.
          </p>
        ) : (
          <p className="text-[12px] text-(--fg-muted)">Los cambios valen solo para este envío: la plantilla no se modifica.</p>
        )}

        {!editandoPlantilla && <label className="flex flex-col gap-1">
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
        </label>}

        {plantilla.editables.filter(k => !(editandoPlantilla && k === 'nombre')).map(k => {
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

        {plantilla.adjuntos && !editandoPlantilla && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className={ETIQUETA}>Adjuntos</span>
              <button type="button" onClick={() => elegirArchivo.current?.click()}
                className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
                <Paperclip size={13} />Agregar archivo
              </button>
              <input ref={elegirArchivo} type="file" multiple className="hidden" onChange={e => sumarArchivos(e.target.files)} />
            </div>
            {archivos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {archivos.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] [border:1px_solid_var(--line)]">
                    <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
                    <span className="shrink-0 text-[11.5px] text-(--fg-muted)">{formatSize(f.size)}</span>
                    <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setArchivos(prev => prev.filter((_, j) => j !== i))}
                      className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-(--fg-muted) hover:bg-(--surface-2) hover:text-foreground">
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pesados && <span className="text-[11.5px] text-destructive">Los adjuntos pasan los 10MB</span>}
          </div>
        )}
      </div>
      </div>
      {editandoPlantilla ? (
        <footer className="flex shrink-0 items-center justify-end gap-3 px-4 py-3 [border-top:1px_solid_var(--line)]">
          {problemaDePlantilla && <span className="min-w-0 truncate text-[12px] text-(--fg-muted)">{problemaDePlantilla}</span>}
          <button type="button" onClick={cerrarEdicionDePlantilla} disabled={guardar.isPending}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-lg px-3.5 text-[13px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground disabled:opacity-40">
            Cancelar
          </button>
          <button type="button" onClick={() => guardar.mutate()} disabled={!!problemaDePlantilla || guardar.isPending || !userSession}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            <Save size={14} />{guardar.isPending ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </footer>
      ) : (
      <footer className="flex shrink-0 items-center justify-end gap-3 px-4 py-3 [border-top:1px_solid_var(--line)]">
        {problema &&<span className="min-w-0 truncate text-[12px] text-(--fg-muted)">{problema}</span>}
        {/* Lo que pasó con el último envío, al lado del botón; mientras no se mandó nada, de quién llega. */}
        {enviar.isPending || enviar.data
          ? <EstadoDelEnvio enviando={enviar.isPending} resendId={enviar.isPending ? null : enviar.data?.id ?? null} />
          : <span className="hidden text-[12px] text-(--fg-muted) md:inline">{problema ? '' : `Llega de «${nombreEnBandeja(remitente)}» <info@propelia.es>`}</span>}
        <button type="button" onClick={() => enviar.mutate()} disabled={!!problema || enviar.isPending}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          <Send size={14} />{enviar.isPending ? 'Enviando…' : 'Enviar email'}
        </button>
      </footer>
      )}
    </>
  )
}

const TONOS = {
  pendiente: 'bg-(--surface-2) text-(--fg-2)',
  ok: 'bg-emerald-50 text-emerald-700',
  aviso: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
} as const

/* La pastilla del pie (20/10/2026): «Enviando…» mientras sale, y después lo que dice Resend por el
   webhook (`crm_emails`), que se va actualizando solo: entregado, rebotó, no se pudo enviar… Si no
   llegó, el aviso con «Abrir lead» lo da `useAvisosDeEmails` aunque esta ventana ya esté cerrada. */
function EstadoDelEnvio({ enviando, resendId }: { enviando: boolean; resendId: string | null }) {
  const q = useEstadoDeEnvio(resendId)
  if (enviando) {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium', TONOS.pendiente)}>
        <Loader2 size={13} className="animate-spin" />Enviando…
      </span>
    )
  }
  const estado = estadoDelEnvio(q.data?.status ?? null)
  const motivo = q.data ? motivoLegible(q.data) : null
  const Icono = estado.tono === 'ok' ? CheckCircle2 : estado.tono === 'error' ? MailX : estado.tono === 'aviso' ? Clock : Loader2
  return (
    <span title={[motivo, q.data?.status_detail && `Resend: ${q.data.status_detail}`].filter(Boolean).join(' — ') || undefined} aria-live="polite"
      className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium', TONOS[estado.tono])}>
      <Icono size={13} className={cn('shrink-0', estado.tono === 'pendiente' && 'animate-spin')} />
      <span className="truncate">{estado.texto}{estado.tono === 'error' && motivo ? ` · ${motivo}` : ''}</span>
    </span>
  )
}
