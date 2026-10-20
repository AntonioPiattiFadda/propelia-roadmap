import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MailIcon, PaperclipIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { base64Size, fileToAttachment, MAX_ATTACHMENTS_BYTES, sendEmail } from '../service/email.service'

/* Para probar que el envío anda antes de colgarle los mails automáticos del CRM. Solo lo monta la
   cabecera para un SUPERADMIN; la edge function lo exige igual. El remitente no se elige. */
const SUBJECT = 'Prueba de envío — Propelia CRM'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function TestEmailDialog() {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const send = useMutation({
    mutationFn: async () => sendEmail({
      to: to.trim(), subject: SUBJECT, text: message,
      attachments: await Promise.all(files.map(fileToAttachment)),
    }),
    onSuccess: () => {
      toast.success(`Email enviado a ${to.trim()}`)
      setOpen(false)
      setMessage('')
      setFiles([])
    },
    onError: (e: Error) => { toast.error(e.message || 'No se pudo enviar el email') },
  })

  const tooBig = files.reduce((n, f) => n + base64Size(f.size), 0) > MAX_ATTACHMENTS_BYTES
  const valid = EMAIL.test(to.trim()) && message.trim().length > 0 && !tooBig

  const addFiles = (list: FileList | null) => {
    // Se copian ya: el `value = ''` de abajo vacía el mismo `FileList` antes de que corra el updater.
    const added = Array.from(list ?? [])
    if (added.length) setFiles(prev => [...prev, ...added])
    // Si no, elegir otra vez el mismo archivo después de sacarlo no dispara `onChange`.
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={MailIcon} size="xs" />
          Email de prueba
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-130">
        <DialogHeader>
          <DialogTitle>Email de prueba</DialogTitle>
          <DialogDescription>Sale desde info@propelia.es con el asunto «{SUBJECT}».</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="test-email-to">Para</Label>
            <Input id="test-email-to" type="email" placeholder="casilla@ejemplo.com" value={to}
              onChange={e => setTo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="test-email-message">Mensaje</Label>
            <Textarea id="test-email-message" rows={6} value={message} onChange={e => setMessage(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Adjuntos</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
                <Icon icon={PaperclipIcon} size="xs" />
                Agregar archivo
              </Button>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={`Quitar ${f.name}`}
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                      <Icon icon={XIcon} size="xs" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {tooBig && <p className="text-xs text-destructive">Los adjuntos pasan los 10MB</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!valid || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
