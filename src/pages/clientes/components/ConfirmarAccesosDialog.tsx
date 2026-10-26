import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { sendEmail } from '@/pages/crm/service/email.service'
import { useMarcarTarea } from '../hooks/useClientes'
import { mailDeAcceso } from '../lib/mensajes'
import { TAREA_CREDENCIALES } from '../lib/pasos'
import { contrasenaInicial } from '../lib/usuariosExcel'
import { PUENTE_SIMULADO } from '../service/puente'
import type { DatosDelAlta } from './datosDelAlta'

/* «Verificar accesos y enviar a cada uno su usuario y clave por mail» no se tilda a mano: pasa por
   acá. Los mails no se deshacen, así que la pregunta va antes: sin tildar «Verifiqué que todas las
   cuentas entran correctamente» no se habilita «Enviar». Sale uno por persona desde
   info@propelia.es por `send-email` (texto libre: solo SUPERADMIN) y recién con todos enviados se
   tilda la tarea. La contraseña no se guarda en ningún lado: se vuelve a armar igual que al crear
   la cuenta, con el año de cuando se cargó el miembro.

   Con el puente simulado las cuentas no existen en Propelia: no se manda nada, solo se tilda. */
export function ConfirmarAccesosDialog({ datos, abierto, onCerrar }: { datos: DatosDelAlta; abierto: boolean; onCerrar: () => void }) {
  const [verifique, setVerifique] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const marcar = useMarcarTarea()
  const miembros = datos.o.miembros
    .filter(m => m.email)
    .map(m => ({ ...m, contrasena: contrasenaInicial(m.first_name, m.last_name, new Date(m.created_at).getFullYear()) }))

  const cerrar = () => { setVerifique(false); onCerrar() }

  const enviar = async () => {
    setEnCurso(true)
    const fallaron: string[] = []
    if (!PUENTE_SIMULADO) {
      for (const m of miembros) {
        const mail = mailDeAcceso({ nombre: `${m.first_name} ${m.last_name}`, email: m.email!, contrasena: m.contrasena, inmobiliaria: datos.inmobiliaria, soporte: datos.soporte })
        try { await sendEmail({ to: m.email!, ...mail }) } catch { fallaron.push(m.email!) }
      }
    }
    setEnCurso(false)
    if (fallaron.length) {
      toast.error(`No salieron ${fallaron.length} de ${miembros.length} mails`, { description: fallaron.join(', '), duration: Infinity, closeButton: true })
      return
    }
    marcar.mutate({ onboardingId: datos.o.id, taskId: TAREA_CREDENCIALES, hecha: true })
    toast.success(PUENTE_SIMULADO ? 'Tarea hecha (puente simulado: no se mandó ningún mail)' : `${miembros.length} mails de acceso enviados`)
    cerrar()
  }

  return (
    <AlertDialog open={abierto} onOpenChange={o => { if (!o && !enCurso) cerrar() }}>
      <AlertDialogContent className="ui-scale sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Enviar los accesos por mail?</AlertDialogTitle>
          <AlertDialogDescription>
            A cada persona le llega un mail desde info@propelia.es con su usuario, su contraseña y el enlace para entrar a
            Propelia. Se envían {miembros.length} mails y no se pueden deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-56 overflow-y-auto rounded-md border border-(--line) text-[13px]">
          {miembros.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-3 border-b border-(--line) px-3 py-2 last:border-0">
              <span className="min-w-0"><b className="block truncate">{m.first_name} {m.last_name}</b><span className="block truncate text-(--fg-muted)">{m.email}</span></span>
              <code className="shrink-0 text-[12px]">{m.contrasena}</code>
            </li>
          ))}
        </ul>
        {PUENTE_SIMULADO && <p className="text-[12.5px] text-(--fg-muted)">Puente simulado: las cuentas todavía no existen en Propelia, así que no se manda ningún mail.</p>}
        <label className="flex cursor-pointer items-start gap-3 rounded-md bg-warning/10 p-3 text-[13px]">
          <Checkbox className="mt-0.5" checked={verifique} onCheckedChange={v => setVerifique(v === true)} />
          <span><b className="block">Verifiqué que todas las cuentas entran correctamente</b>Probé el acceso con el email y la contraseña de cada una.</span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enCurso}>Cancelar</AlertDialogCancel>
          <Button disabled={!verifique || enCurso || !miembros.length} onClick={() => void enviar()}>
            {enCurso && <Loader2 className="size-4 animate-spin" />}
            Enviar {miembros.length} mails
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
