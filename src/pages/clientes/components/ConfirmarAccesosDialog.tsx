import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { sendEmail } from '@/pages/crm/service/email.service'
import { remitenteDe, renderEmailDeAcceso } from '../../../../supabase/functions/_shared/plantillasEmail.ts'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { CLIENTES_KEYS, useMarcarTarea } from '../hooks/useClientes'
import { completarTareasDeRevisarEquipo } from '../service/clientes.service'
import { TAREA_CREDENCIALES } from '../lib/pasos'
import { contrasenaInicial } from '../lib/equipo'
import { PUENTE_SIMULADO } from '../service/puente'
import type { DatosDelAlta } from './datosDelAlta'

/* «Verificar accesos y enviar a cada uno su usuario y clave por mail» no se tilda a mano: pasa por
   acá. Los mails no se deshacen, así que la pregunta va antes: sin tildar «Verifiqué que todas las
   cuentas entran correctamente» no se habilita «Enviar». Sale uno por persona desde
   info@propelia.es por `send-email` con `acceso` (solo SUPERADMIN): el HTML lo arma el servidor con
   `renderEmailDeAcceso` (`_shared/plantillasEmail.ts`), el mismo que pinta «Ver cómo les llega», y
   va siempre al email de la cuenta. Recién con todos enviados se tilda la tarea y se completa la
   del CRM «Revisar e importar el equipo de …» (27/10/2026, por pedido). La contraseña no
   se guarda en ningún lado: se vuelve a armar igual que al crear la cuenta, con el año de cuando se
   cargó el miembro.

   Con el puente simulado las cuentas no existen en Propelia: no se manda nada, solo se tilda. */
export function ConfirmarAccesosDialog({ datos, abierto, onCerrar }: { datos: DatosDelAlta; abierto: boolean; onCerrar: () => void }) {
  const [verifique, setVerifique] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const marcar = useMarcarTarea()
  const qc = useQueryClient()
  const miembros = datos.o.miembros
    .filter(m => m.email)
    .map(m => ({ ...m, contrasena: contrasenaInicial(m.first_name, m.last_name, new Date(m.created_at).getFullYear()) }))
  const accesoDe = (m: (typeof miembros)[number]) =>
    ({ nombre: `${m.first_name} ${m.last_name}`.trim(), email: m.email!, contrasena: m.contrasena, inmobiliaria: datos.inmobiliaria })

  /* La vista previa, con la primera persona. La firma real la pone el servidor con la fila de
     `users` de quien manda (cargo y teléfono incluidos); acá va solo el nombre de quien lleva el alta. */
  const primero = miembros[0]
  const vistaPrevia = primero
    ? renderEmailDeAcceso(accesoDe(primero), remitenteDe({ nombre: datos.soporte }), { assets: `${window.location.origin}/email` }).html
    : null

  const cerrar = () => { setVerifique(false); onCerrar() }

  const enviar = async () => {
    setEnCurso(true)
    const fallaron: string[] = []
    if (!PUENTE_SIMULADO) {
      for (const m of miembros) {
        // Con el lead, un rebote se ve en el renglón de la tarea y en el lead, y crea la tarea del
        // CRM «Revisar el mail de acceso que no llegó a …» (trigger `crm_emails_acceso_no_llego`).
        try { await sendEmail({ acceso: accesoDe(m), leadId: datos.o.lead.id }) } catch { fallaron.push(m.email!) }
      }
    }
    setEnCurso(false)
    if (fallaron.length) {
      toast.error(`No salieron ${fallaron.length} de ${miembros.length} mails`, { description: fallaron.join(', '), duration: Infinity, closeButton: true })
      return
    }
    marcar.mutate({ onboardingId: datos.o.id, taskId: TAREA_CREDENCIALES, hecha: true })
    completarTareasDeRevisarEquipo(datos.o.lead.id)
      .then(() => Promise.all([
        qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings }),
        qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes }),
        qc.invalidateQueries({ queryKey: CRM_KEYS.detalle(datos.o.lead.id) }),
      ]))
      .catch(() => toast.warning('Los mails salieron, pero no se completó la tarea «Revisar e importar el equipo» del CRM'))
    toast.success(PUENTE_SIMULADO ? 'Tarea hecha (puente simulado: no se mandó ningún mail)' : `${miembros.length} mails de acceso enviados`)
    cerrar()
  }

  return (
    <AlertDialog open={abierto} onOpenChange={o => { if (!o && !enCurso) cerrar() }}>
      <AlertDialogContent className="ui-scale max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Enviar los accesos por mail?</AlertDialogTitle>
          <AlertDialogDescription>
            A cada persona le llega un mail desde info@propelia.es con su usuario, su contraseña temporal y el enlace para
            entrar a Propelia. Se envían {miembros.length} mails y no se pueden deshacer.
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
        {vistaPrevia && (
          <details className="group text-[13px]">
            <summary className="flex w-max cursor-pointer list-none items-center gap-1 text-(--fg-2) hover:text-foreground">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Ver cómo les llega
            </summary>
            {/* Sin `allow-scripts`: es el HTML del mail, no tiene nada que correr. */}
            <iframe title="Vista previa del mail de accesos" srcDoc={vistaPrevia} sandbox=""
              className="mt-2 h-[460px] w-full rounded-md border border-(--line) bg-white" />
          </details>
        )}
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
