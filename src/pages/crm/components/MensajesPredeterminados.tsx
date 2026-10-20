import { useMemo, useRef, useState } from 'react'
import { FileText, Mail, MessageCircle, Paperclip, Plus, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PlantillaEmailId } from '../../../../supabase/functions/_shared/plantillasEmail.ts'
import { enlaceDeWhatsapp } from '../lib/whatsapp'
import type { CrmClient } from '../types'
import { EmailConPlantilla, ListaDePlantillasEmail } from './EmailConPlantilla'

/* WhatsApp es SOLO LA PARTE VISUAL (12/10/2026): las plantillas viven en el estado del componente y
   «Enviar» no manda nada. Falta la tabla de plantillas, el bucket de sus adjuntos y el envío de verdad.
   Email sí manda (18/10/2026): son las dos plantillas HTML fijas de `EmailConPlantilla`. */

type Canal = 'whatsapp' | 'email'

interface Adjunto { id: string; nombre: string; peso: number }

interface Plantilla {
  id: string
  canal: Canal
  nombre: string
  asunto: string
  texto: string
  adjuntos: Adjunto[]
}

const EJEMPLOS: Plantilla[] = [
  { id: 'p1', canal: 'whatsapp', nombre: 'Primer contacto', asunto: '', adjuntos: [],
    texto: 'Hola {nombre}, ¿qué tal? Te escribo de Propelia. Vi la ficha de {empresa} en Idealista y quería contarte cómo ayudamos a las inmobiliarias a gestionar sus leads. ¿Tenés 10 minutos esta semana?' },
  { id: 'p2', canal: 'whatsapp', nombre: 'Presentación con PDF', asunto: '',
    adjuntos: [{ id: 'a1', nombre: 'Propelia - presentación.pdf', peso: 1_840_000 }],
    texto: 'Hola {nombre}, como te comenté por teléfono, te paso la presentación de Propelia. Cualquier duda me escribís por acá.' },
]

const VARIABLES = ['{nombre}', '{empresa}'] as const

function rellenar(texto: string, client: CrmClient | null): string {
  return texto
    .replaceAll('{nombre}', client?.first_name?.trim() || 'equipo')
    .replaceAll('{empresa}', client?.company_name?.trim() || 'tu inmobiliaria')
}

function fmtPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* El de Idealista no entra: es un redirector y a la agencia le llega como un interesado en un piso. */
function destinatariosDe(client: CrmClient | null, canal: Canal): { valor: string; rotulo: string }[] {
  if (!client) return []
  if (canal === 'email') return client.email ? [{ valor: client.email, rotulo: client.email }] : []
  const nombrePrincipal = [client.first_name, client.last_name].filter(Boolean).join(' ')
  return [
    { valor: client.phone, rotulo: nombrePrincipal || 'Principal' },
    { valor: client.alternative_phone_1, rotulo: client.alternative_phone_1_note || 'Alternativo 1' },
    { valor: client.alternative_phone_2, rotulo: client.alternative_phone_2_note || 'Alternativo 2' },
    { valor: client.google_maps_phone, rotulo: 'Google Maps' },
  ].filter((d): d is { valor: string; rotulo: string } => !!d.valor)
    .map(d => ({ valor: d.valor, rotulo: `${d.rotulo} · ${d.valor}` }))
}

const plantillaVacia = (canal: Canal): Plantilla =>
  ({ id: '', canal, nombre: '', asunto: '', texto: '', adjuntos: [] })

/** El botón del perfil del lead (panel izquierdo) que abre los mensajes predeterminados. */
export function BotonMensajes({ client, className }: { client: CrmClient | null; className?: string }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} title="Mandar un mensaje predeterminado"
        className={cn('inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-(--fg-2) transition-colors [border:1px_solid_var(--line)] hover:bg-(--surface-2) hover:text-foreground', className)}>
        <MessageCircle size={15} />
        Mensajes
      </button>
      <MensajesPredeterminadosDialog client={client} abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  )
}

export function MensajesPredeterminadosDialog({ client, abierto, onCerrar }: {
  client: CrmClient | null
  abierto: boolean
  onCerrar: () => void
}) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>(EJEMPLOS)
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [elegidaId, setElegidaId] = useState<string | null>(null)
  /* Con borrador se edita (nueva si su id está vacío); sin borrador se mira la elegida. */
  const [borrador, setBorrador] = useState<Plantilla | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [destino, setDestino] = useState('')
  const [plantillaEmail, setPlantillaEmail] = useState<PlantillaEmailId>('presentacion-video')

  const delCanal = plantillas.filter(p => p.canal === canal)
  const elegida = delCanal.find(p => p.id === elegidaId) ?? delCanal[0] ?? null
  const destinatarios = useMemo(() => destinatariosDe(client, canal), [client, canal])
  const destinoEfectivo = destinatarios.some(d => d.valor === destino) ? destino : destinatarios[0]?.valor ?? ''

  const cambiarCanal = (c: Canal) => { setCanal(c); setElegidaId(null); setBorrador(null); setBorrando(null) }

  const guardarBorrador = () => {
    if (!borrador || !borrador.nombre.trim() || !borrador.texto.trim()) return
    if (borrador.id) {
      setPlantillas(ps => ps.map(p => p.id === borrador.id ? borrador : p))
    } else {
      const nueva = { ...borrador, id: crypto.randomUUID() }
      setPlantillas(ps => [...ps, nueva])
      setElegidaId(nueva.id)
    }
    setBorrador(null)
  }

  const borrar = (id: string) => {
    setPlantillas(ps => ps.filter(p => p.id !== id))
    if (elegidaId === id) setElegidaId(null)
    setBorrando(null)
  }

  const enviar = () => {
    if (!elegida || !destinoEfectivo) return
    if (canal === 'whatsapp') {
      // Se abre en el mismo clic: después de un await el navegador bloquea la pestaña nueva.
      const url = enlaceDeWhatsapp(destinoEfectivo, rellenar(elegida.texto, client))
      if (!url) { toast.error('Ese teléfono no es válido para WhatsApp', { description: destinoEfectivo }); return }
      window.open(url, '_blank', 'noopener')
      return
    }
    toast.info('El envío todavía no está conectado', {
      description: `«${elegida.nombre}» a ${destinoEfectivo}${elegida.adjuntos.length ? ` con ${elegida.adjuntos.length} adjunto(s)` : ''}.`,
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) { setBorrador(null); onCerrar() } }}>
      <DialogContent showCloseButton={false}
        className={cn('dialog-fullscreen-mobile flex max-h-none max-w-none flex-col gap-0 overflow-hidden p-0',
          canal === 'email' ? 'h-[88vh] w-[min(1400px,96vw)]' : 'h-[80vh] w-[min(900px,94vw)]')}>
        <header className="flex shrink-0 items-center gap-3 px-4 py-3 [border-bottom:1px_solid_var(--line)]">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[15px]">Mensajes predeterminados</DialogTitle>
            <DialogDescription className="text-[12.5px]">Elegí uno y mandáselo a la inmobiliaria.</DialogDescription>
          </div>
          <div role="tablist" aria-label="Canal" className="flex shrink-0 rounded-lg bg-(--surface-2) p-0.5">
            {([['whatsapp', 'WhatsApp', MessageCircle], ['email', 'Email', Mail]] as const).map(([id, rotulo, Ico]) => (
              <button key={id} type="button" role="tab" aria-selected={canal === id} onClick={() => cambiarCanal(id)}
                className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold transition-colors',
                  canal === id ? 'bg-card text-foreground shadow-sm' : 'text-(--fg-2) hover:text-foreground')}>
                <Ico size={14} />{rotulo}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Cerrar" onClick={onCerrar}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[260px_1fr] md:overflow-hidden">
          {/* La lista de plantillas del canal. */}
          <aside className="flex min-w-0 flex-col bg-(--surface-2) p-2 md:min-h-0 md:overflow-y-auto md:[border-right:1px_solid_var(--line)]">
            {canal === 'email' ? <ListaDePlantillasEmail elegida={plantillaEmail} onElegir={setPlantillaEmail} /> : <>
            <ul className="flex flex-col gap-1">
              {delCanal.map(p => {
                const activa = !borrador && elegida?.id === p.id
                return (
                  <li key={p.id}>
                    <div className={cn('group flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors',
                      activa ? 'bg-card [box-shadow:0_0_0_1px_var(--line)]' : 'hover:bg-card/60')}>
                      <button type="button" onClick={() => { setElegidaId(p.id); setBorrador(null); setBorrando(null) }}
                        className="min-w-0 flex-1 cursor-pointer text-left">
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                          <span className="truncate">{p.nombre}</span>
                          {p.adjuntos.length > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-(--fg-muted)">
                              <Paperclip size={11} />{p.adjuntos.length}
                            </span>
                          )}
                        </span>
                        <span className="line-clamp-2 text-[12px] leading-snug text-(--fg-muted)">{p.texto}</span>
                      </button>
                      {borrando === p.id ? (
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <button type="button" onClick={() => borrar(p.id)}
                            className="cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-destructive hover:bg-destructive/10">Borrar</button>
                          <button type="button" onClick={() => setBorrando(null)}
                            className="cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-(--fg-2) hover:bg-(--surface-2)">No</button>
                        </span>
                      ) : (
                        <button type="button" aria-label={`Borrar «${p.nombre}»`} title="Borrar" onClick={() => setBorrando(p.id)}
                          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-faint) opacity-0 transition-opacity hover:bg-(--surface-2) hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
              {delCanal.length === 0 && (
                <li className="px-2.5 py-2 text-[12.5px] text-(--fg-muted)">Todavía no hay mensajes para este canal.</li>
              )}
            </ul>
            <button type="button" onClick={() => { setBorrador(plantillaVacia(canal)); setBorrando(null) }}
              className="mt-2 flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12.5px] font-medium text-(--fg-2) hover:bg-card hover:text-foreground">
              <Plus size={14} />Nuevo mensaje
            </button>
            </>}
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            {canal === 'email' ? (
              <EmailConPlantilla key={plantillaEmail} id={plantillaEmail} client={client} />
            ) : borrador ? (
              <EditorDePlantilla borrador={borrador} onCambiar={setBorrador}
                onGuardar={guardarBorrador} onCancelar={() => setBorrador(null)} />
            ) : elegida ? (
              <>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-[14px] font-semibold">{elegida.nombre}</h3>
                    <button type="button" onClick={() => setBorrador(elegida)}
                      className="cursor-pointer text-[12.5px] font-semibold text-(--brand-soft-fg) hover:underline">Editar</button>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)">Para</span>
                    {destinatarios.length > 0 ? (
                      <Select value={destinoEfectivo} onValueChange={setDestino}>
                        <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {destinatarios.map(d => <SelectItem key={d.valor} value={d.valor}>{d.rotulo}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="rounded-md bg-(--surface-2) px-2.5 py-2 text-[12.5px] text-(--fg-muted)">
                        {canal === 'whatsapp' ? 'La inmobiliaria no tiene ningún teléfono cargado.' : 'La inmobiliaria no tiene email cargado.'}
                      </p>
                    )}
                  </label>

                  {/* Cómo le va a llegar: la burbuja de WhatsApp o el cuerpo del mail, con las variables ya puestas. */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)">Vista previa</span>
                    {canal === 'whatsapp' ? (
                      <div className="rounded-xl bg-(--surface-2) p-3">
                        <div className="ml-auto flex max-w-[85%] flex-col gap-1.5 rounded-xl rounded-tr-sm bg-[#d9fdd3] p-2.5 text-[13px] leading-snug text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
                          {elegida.adjuntos.map(a => <ChipAdjunto key={a.id} adjunto={a} enBurbuja />)}
                          <p className="whitespace-pre-wrap">{rellenar(elegida.texto, client)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 rounded-xl p-3 [border:1px_solid_var(--line)]">
                        <p className="text-[13px]"><span className="text-(--fg-muted)">Asunto: </span>
                          <span className="font-semibold">{rellenar(elegida.asunto, client) || '(sin asunto)'}</span></p>
                        <p className="whitespace-pre-wrap text-[13px] leading-snug">{rellenar(elegida.texto, client)}</p>
                        {elegida.adjuntos.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">{elegida.adjuntos.map(a => <ChipAdjunto key={a.id} adjunto={a} />)}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <footer className="flex shrink-0 justify-end gap-2 px-4 py-3 [border-top:1px_solid_var(--line)]">
                  <button type="button" onClick={enviar} disabled={!destinoEfectivo}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                    <Send size={14} />{canal === 'whatsapp' ? 'Enviar por WhatsApp' : 'Enviar email'}
                  </button>
                </footer>
              </>
            ) : (
              <p className="m-auto p-6 text-center text-[13px] text-(--fg-muted)">Creá un mensaje para empezar.</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EditorDePlantilla({ borrador, onCambiar, onGuardar, onCancelar }: {
  borrador: Plantilla
  onCambiar: (p: Plantilla) => void
  onGuardar: () => void
  onCancelar: () => void
}) {
  const archivos = useRef<HTMLInputElement>(null)
  const texto = useRef<HTMLTextAreaElement>(null)
  const listo = borrador.nombre.trim() !== '' && borrador.texto.trim() !== ''

  const insertarVariable = (v: string) => {
    const el = texto.current
    const desde = el?.selectionStart ?? borrador.texto.length
    const hasta = el?.selectionEnd ?? borrador.texto.length
    onCambiar({ ...borrador, texto: borrador.texto.slice(0, desde) + v + borrador.texto.slice(hasta) })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(desde + v.length, desde + v.length) })
  }

  const agregarArchivos = (lista: FileList | null) => {
    if (!lista?.length) return
    const nuevos = Array.from(lista, f => ({ id: crypto.randomUUID(), nombre: f.name, peso: f.size }))
    onCambiar({ ...borrador, adjuntos: [...borrador.adjuntos, ...nuevos] })
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <h3 className="text-[14px] font-semibold">{borrador.id ? 'Editar mensaje' : 'Nuevo mensaje'}</h3>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)">Nombre</span>
          <Input autoFocus value={borrador.nombre} placeholder="Ej.: Primer contacto"
            onChange={e => onCambiar({ ...borrador, nombre: e.target.value })} className="h-9 text-[13px] md:text-[13px]" />
        </label>
        {borrador.canal === 'email' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)">Asunto</span>
            <Input value={borrador.asunto} placeholder="Ej.: Propelia para {empresa}"
              onChange={e => onCambiar({ ...borrador, asunto: e.target.value })} className="h-9 text-[13px] md:text-[13px]" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)">Mensaje</span>
            <span className="flex gap-1">
              {VARIABLES.map(v => (
                <button key={v} type="button" onClick={() => insertarVariable(v)} title="Se reemplaza al enviar"
                  className="cursor-pointer rounded-md bg-(--surface-2) px-1.5 py-0.5 font-mono text-[11px] text-(--fg-2) hover:text-foreground">{v}</button>
              ))}
            </span>
          </span>
          <Textarea ref={texto} rows={7} value={borrador.texto} placeholder="Hola {nombre}, …"
            onChange={e => onCambiar({ ...borrador, texto: e.target.value })}
            className="min-h-32 resize-y text-[13px] md:text-[13px]" />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)">Adjuntos</span>
          {borrador.adjuntos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {borrador.adjuntos.map(a => (
                <ChipAdjunto key={a.id} adjunto={a}
                  onQuitar={() => onCambiar({ ...borrador, adjuntos: borrador.adjuntos.filter(x => x.id !== a.id) })} />
              ))}
            </div>
          )}
          <input ref={archivos} type="file" multiple hidden
            onChange={e => { agregarArchivos(e.target.files); e.target.value = '' }} />
          <button type="button" onClick={() => archivos.current?.click()}
            className="flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
            <Paperclip size={14} />Adjuntar archivo
          </button>
        </div>
      </div>
      <footer className="flex shrink-0 justify-end gap-2 px-4 py-3 [border-top:1px_solid_var(--line)]">
        <button type="button" onClick={onCancelar}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-[13px] font-semibold text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
          Cancelar
        </button>
        <button type="button" onClick={onGuardar} disabled={!listo}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-foreground px-3.5 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          Guardar mensaje
        </button>
      </footer>
    </>
  )
}

function ChipAdjunto({ adjunto, onQuitar, enBurbuja }: { adjunto: Adjunto; onQuitar?: () => void; enBurbuja?: boolean }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]',
      enBurbuja ? 'bg-black/5 dark:bg-white/10' : 'bg-(--surface-2) [border:1px_solid_var(--line)]')}>
      <FileText size={15} className="shrink-0 text-(--fg-muted)" />
      <span className="min-w-0 truncate font-medium">{adjunto.nombre}</span>
      <span className="shrink-0 text-[11px] text-(--fg-muted)">{fmtPeso(adjunto.peso)}</span>
      {onQuitar && (
        <button type="button" aria-label={`Quitar ${adjunto.nombre}`} onClick={onQuitar}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-(--fg-faint) hover:text-destructive">
          <X size={13} />
        </button>
      )}
    </span>
  )
}
