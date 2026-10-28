import { ChevronRight, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useMarcarTarea, useOrganizacion } from '../hooks/useClientes'
import { contrasenaInicial } from '../lib/equipo'
import { tareaCuentaProbada } from '../lib/pasos'
import type { DatosDelAlta } from './datosDelAlta'
import { copiarTexto } from './EnviarPorWhatsapp'

const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/* Las cuentas que creó «Importar», plegadas debajo de la tarea (28/10/2026, por pedido): usuario
   (el email) y contraseña de cada uno, con la misma `contrasenaInicial` del import y de los mails de
   accesos (el año es el de cuando se cargó el miembro). No se guardan en ningún lado: se rearman.
   La columna «Entró» (28/10/2026, por pedido) dice quién ya entró a su cuenta en Propelia y cuándo
   por primera vez: sale de `get_organization` del puente, cruzada por email. «Probé» es el tilde a
   mano de quien lleva el alta: entró con ese usuario y anda (`tareaCuentaProbada`). */
export function CuentasCreadas({ datos }: { datos: DatosDelAlta }) {
  const miembros = datos.o.miembros
  const org = useOrganizacion(datos.orgId)
  const marcar = useMarcarTarea()
  const probadas = new Set(datos.o.tareas.map(t => t.task_id))
  const porEmail = new Map((org.data?.agents ?? []).filter(a => a.email).map(a => [a.email!.toLowerCase(), a]))
  // Sin el dato (puente viejo o caído) no se dice nada, en vez de «no entró» para todos.
  const sabeLogins = (org.data?.agents ?? []).some(a => a.last_sign_in_at !== undefined)
  const cuentas = [...miembros]
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.created_at.localeCompare(b.created_at))
    .map(m => {
      const agente = m.email ? porEmail.get(m.email.toLowerCase()) : undefined
      return {
        id: m.id, nombre: `${m.first_name} ${m.last_name}`.trim(), responsable: m.is_owner, usuario: m.email ?? '',
        contrasena: contrasenaInicial(m.first_name, m.last_name, new Date(m.created_at).getFullYear()),
        entro: agente?.first_sign_in_at ?? null, ultima: agente?.last_sign_in_at ?? null,
        probada: probadas.has(tareaCuentaProbada(m.id)),
      }
    })
  const entraron = cuentas.filter(c => c.entro).length
  const nProbadas = cuentas.filter(c => c.probada).length
  const todo = cuentas.map(c => `${c.nombre}\nUsuario: ${c.usuario}\nContraseña: ${c.contrasena}`).join('\n\n')
  const copiar = (texto: string, aviso: string, rotulo: string) => (
    <Button size="icon" variant="ghost" className="size-6 shrink-0" title={`Copiar ${rotulo}`} aria-label={`Copiar ${rotulo}`}
      onClick={() => void copiarTexto(texto, aviso)}>
      <Copy className="size-3" />
    </Button>
  )

  return (
    <details className="group ml-6.5 text-[12.5px]">
      <summary className="flex w-max cursor-pointer list-none items-center gap-1 text-(--fg-muted) hover:text-foreground">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Ver cuentas y contraseñas
        <span className={nProbadas === cuentas.length ? 'font-medium text-success' : undefined}>
          · {nProbadas === cuentas.length ? 'todas probadas' : `${nProbadas} de ${cuentas.length} probadas`}
        </span>
        {sabeLogins && (
          <span className={entraron === cuentas.length ? 'font-medium text-success' : undefined}>
            · {entraron === cuentas.length ? 'ya entraron todos' : `${entraron} de ${cuentas.length} ya entraron`}
          </span>
        )}
      </summary>
      <div className="mt-1.5 flex flex-col gap-2 rounded-md border border-(--line) bg-(--surface-2) p-3">
        <div className="overflow-x-auto rounded-md border border-(--line) bg-card">
          <table className="w-full min-w-[640px]">
            <thead className="bg-(--surface-2) text-left text-[11px] uppercase tracking-wide text-(--fg-muted)">
              <tr>{['Nombre', 'Usuario', 'Contraseña', 'Probé', 'Entró'].map(h => <th key={h} className="px-2.5 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {cuentas.map(c => (
                <tr key={c.id} className="border-t border-(--line)">
                  <td className="px-2.5 py-1.5">
                    {c.nombre}
                    {c.responsable && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Responsable</span>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <span className="flex items-center gap-1">{c.usuario}{c.usuario && copiar(c.usuario, 'Usuario copiado', `el usuario de ${c.nombre}`)}</span>
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-[12px]">
                    <span className="flex items-center gap-1">{c.contrasena}{copiar(c.contrasena, 'Contraseña copiada', `la contraseña de ${c.nombre}`)}</span>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <Checkbox checked={c.probada} title="Entré con este usuario y anda" aria-label={`Probé la cuenta de ${c.nombre}`}
                      onCheckedChange={v => marcar.mutate({ onboardingId: datos.o.id, taskId: tareaCuentaProbada(c.id), hecha: v === true })} />
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5">
                    {!sabeLogins ? <span className="text-(--fg-muted)">—</span>
                      : c.entro ? <span className="font-medium text-success" title={c.ultima ? `Última vez: ${fecha(c.ultima)}` : undefined}>{fecha(c.entro)}</span>
                      : <span className="text-(--fg-muted)">Todavía no</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="outline" className="h-7 self-start" onClick={() => void copiarTexto(todo, 'Cuentas copiadas')}>
          <Copy className="size-3.5" /> Copiar todas
        </Button>
      </div>
    </details>
  )
}
