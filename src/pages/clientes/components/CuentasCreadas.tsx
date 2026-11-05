import { Copy, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useMarcarTarea, useOrganizacion } from '../hooks/useClientes'
import { contrasenaInicial } from '../lib/equipo'
import { tareaCuentaProbada, tareaIngresoBorrado } from '../lib/pasos'
import type { DatosDelAlta } from './datosDelAlta'
import { copiarTexto } from './EnviarPorWhatsapp'

const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/* Las cuentas que creó «Importar» (28/10/2026, por pedido; desde el 29/10/2026 siempre a la vista,
   abajo de todo de la columna del medio, en cualquier paso, y no plegadas debajo de la tarea): usuario
   (el email) y contraseña de cada uno, con la misma `contrasenaInicial` del import y de los mails de
   accesos (el año es el de cuando se cargó el miembro). No se guardan en ningún lado: se rearman.
   La columna «Entró» (28/10/2026, por pedido) dice quién ya entró a su cuenta en Propelia y cuándo
   por primera vez: sale de `get_organization` del puente, cruzada por email. «Probé» es el tilde a
   mano de quien lleva el alta: entró con ese usuario y anda (`tareaCuentaProbada`).
   «Calendario» y el resumen de abajo (29/10/2026, por pedido) siguen la guía de Propelia: quién
   conectó su calendario y si la org ya tiene nombre, web, logo y colores (`setup` del puente).
   El ✕ de «Entró» (29/10/2026, por pedido) borra el ingreso, que puede ser el tuyo al probar: desde
   ahí solo cuenta un login posterior (`tareaIngresoBorrado`), y entonces se ve el último.
   Mientras Propelia no contesta, lo que viene de allá (Entró, Calendario, la org) lleva un spinner. */
export function CuentasCreadas({ datos }: { datos: DatosDelAlta }) {
  const miembros = datos.o.miembros
  const org = useOrganizacion(datos.orgId)
  const marcar = useMarcarTarea()
  const probadas = new Set(datos.o.tareas.map(t => t.task_id))
  const borradoEl = new Map(datos.o.tareas.map(t => [t.task_id, t.done_at]))
  const porEmail = new Map((org.data?.agents ?? []).filter(a => a.email).map(a => [a.email!.toLowerCase(), a]))
  // Sin el dato (puente viejo o caído) no se dice nada, en vez de «no entró» para todos.
  const sabeLogins = (org.data?.agents ?? []).some(a => a.last_sign_in_at !== undefined)
  const sabeCalendarios = (org.data?.agents ?? []).some(a => a.calendar_connected !== undefined)
  const setup = org.data?.setup
  const cargando = org.isLoading
  const cuentas = [...miembros]
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.created_at.localeCompare(b.created_at))
    .map(m => {
      const agente = m.email ? porEmail.get(m.email.toLowerCase()) : undefined
      const ultima = agente?.last_sign_in_at ?? null
      const borrado = borradoEl.get(tareaIngresoBorrado(m.id))
      const entro = !borrado ? agente?.first_sign_in_at ?? null
        : ultima && new Date(ultima) > new Date(borrado) ? ultima : null
      return {
        id: m.id, nombre: `${m.first_name} ${m.last_name}`.trim(), responsable: m.is_owner, usuario: m.email ?? '',
        // Ya tenía cuenta en la org (org existente vinculada): su contraseña es la suya, no la sabemos.
        contrasena: m.existing_account ? null : contrasenaInicial(m.first_name, m.last_name, new Date(m.created_at).getFullYear()),
        entro, ultima, borrado,
        probada: probadas.has(tareaCuentaProbada(m.id)),
        calendario: agente?.calendar_connected === true,
      }
    })
  const entraron = cuentas.filter(c => c.entro).length
  const conCalendario = cuentas.filter(c => c.calendario).length
  const faltaDeLaOrg = setup
    ? ([['name', 'nombre'], ['website', 'web'], ['logo', 'logo'], ['colors', 'colores']] as const).filter(([k]) => !setup[k]).map(([, r]) => r)
    : []
  const nProbadas = cuentas.filter(c => c.probada).length
  const todo = cuentas.map(c => `${c.nombre}\nUsuario: ${c.usuario}\nContraseña: ${c.contrasena ?? 'la suya (ya tenía cuenta)'}`).join('\n\n')
  const copiar = (texto: string, aviso: string, rotulo: string) => (
    <Button size="icon" variant="ghost" className="size-6 shrink-0" title={`Copiar ${rotulo}`} aria-label={`Copiar ${rotulo}`}
      onClick={() => void copiarTexto(texto, aviso)}>
      <Copy className="size-3" />
    </Button>
  )

  return (
    <section className="flex w-fit max-w-full flex-col gap-2 rounded-md border border-(--line) bg-(--surface-2) p-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <h4 className="text-[13px] font-semibold">Cuentas del equipo</h4>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          <Resumen ok={nProbadas === cuentas.length} rotulo="Probadas" valor={`${nProbadas} de ${cuentas.length}`} />
          {(cargando || sabeLogins) && <Resumen cargando={cargando} ok={entraron === cuentas.length} rotulo="Entraron" valor={`${entraron} de ${cuentas.length}`} />}
          {(cargando || sabeCalendarios) && <Resumen cargando={cargando} ok={conCalendario === cuentas.length} rotulo="Calendario conectado" valor={`${conCalendario} de ${cuentas.length}`} />}
          {(cargando || setup) && <Resumen cargando={cargando} ok={!!setup?.done} rotulo="Organización" valor={setup?.done ? 'configurada' : `falta ${faltaDeLaOrg.join(', ')}`} />}
        </ul>
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => void copiarTexto(todo, 'Cuentas copiadas')}>
          <Copy className="size-3.5" /> Copiar todas
        </Button>
      </div>
      <div className="w-fit max-w-full overflow-x-auto rounded-md border border-(--line) bg-card">
        <table className="w-fit">
          <thead className="bg-(--surface-2) text-left text-[11px] uppercase tracking-wide text-(--fg-muted)">
            <tr>{['Nombre', 'Usuario', 'Contraseña', 'Probé', 'Entró', 'Calendario'].map(h => <th key={h} className="px-2.5 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {cuentas.map(c => (
              <tr key={c.id} className="whitespace-nowrap border-t border-(--line)">
                <td className="px-2.5 py-1.5">
                  {c.nombre}
                  {c.responsable && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Responsable</span>}
                </td>
                <td className="px-2.5 py-1.5">
                  <span className="flex items-center gap-1">{c.usuario}{c.usuario && copiar(c.usuario, 'Usuario copiado', `el usuario de ${c.nombre}`)}</span>
                </td>
                <td className="px-2.5 py-1.5 font-mono text-[12px]">
                  {c.contrasena
                    ? <span className="flex items-center gap-1">{c.contrasena}{copiar(c.contrasena, 'Contraseña copiada', `la contraseña de ${c.nombre}`)}</span>
                    : <span className="font-sans text-(--fg-muted)" title="Ya tenía cuenta en la org: no se le cambió la contraseña">Ya tenía cuenta</span>}
                </td>
                <td className="px-2.5 py-1.5">
                  <Checkbox checked={c.probada} title="Entré con este usuario y anda" aria-label={`Probé la cuenta de ${c.nombre}`}
                    onCheckedChange={v => marcar.mutate({ onboardingId: datos.o.id, taskId: tareaCuentaProbada(c.id), hecha: v === true })} />
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5">
                  {cargando ? <Loader2 className="size-3.5 animate-spin text-(--fg-muted)" aria-label="Cargando" />
                    : !sabeLogins ? <span className="text-(--fg-muted)">—</span>
                    : c.entro ? (
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-success" title={c.ultima ? `Última vez: ${fecha(c.ultima)}` : undefined}>{fecha(c.entro)}</span>
                        <Button size="icon" variant="ghost" className="size-6 shrink-0" title="Borrar: fui yo probando la cuenta"
                          aria-label={`Borrar el ingreso de ${c.nombre}`}
                          onClick={() => marcar.mutate({ onboardingId: datos.o.id, taskId: tareaIngresoBorrado(c.id), hecha: true, reiniciar: true })}>
                          <X className="size-3" />
                        </Button>
                      </span>
                    )
                    : <span className="text-(--fg-muted)" title={c.borrado ? `Borraste el ingreso el ${fecha(c.borrado)}` : undefined}>Todavía no</span>}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5">
                  {cargando ? <Loader2 className="size-3.5 animate-spin text-(--fg-muted)" aria-label="Cargando" />
                    : !sabeCalendarios ? <span className="text-(--fg-muted)">—</span>
                    : c.calendario ? <span className="font-medium text-success">Conectado</span>
                    : <span className="text-(--fg-muted)">Todavía no</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const ROLES: Record<string, string> = { admin: 'Administrador', agent: 'Agente', superadmin: 'Superadmin', owner: 'Dueño' }

/* Los usuarios que la org ya tiene en Propelia (5/11/2026, por pedido): con la org vinculada antes
   del equipo («Vincular org existente») todavía no hay `client_onboarding_members`, así que en lugar
   de «Cuentas del equipo» se lista lo que trae `get_organization` del puente. Sin contraseñas: son
   cuentas suyas. Al importar el equipo, esta tabla deja lugar a `CuentasCreadas`. */
export function UsuariosDeLaOrg({ orgId }: { orgId: string }) {
  const org = useOrganizacion(orgId)
  const agentes = [...(org.data?.agents ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const sabeLogins = agentes.some(a => a.last_sign_in_at !== undefined)
  const sabeCalendarios = agentes.some(a => a.calendar_connected !== undefined)
  const setup = org.data?.setup
  const faltaDeLaOrg = setup
    ? ([['name', 'nombre'], ['website', 'web'], ['logo', 'logo'], ['colors', 'colores']] as const).filter(([k]) => !setup[k]).map(([, r]) => r)
    : []
  const entraron = agentes.filter(a => a.first_sign_in_at).length
  const conCalendario = agentes.filter(a => a.calendar_connected).length

  return (
    <section className="flex w-fit max-w-full flex-col gap-2 rounded-md border border-(--line) bg-(--surface-2) p-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <h4 className="text-[13px] font-semibold">Usuarios de {org.data?.name ?? 'la org'} en Propelia</h4>
        {org.isLoading ? <Loader2 className="size-3.5 animate-spin text-(--fg-muted)" aria-label="Cargando" /> : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <Resumen ok rotulo="Usuarios" valor={String(agentes.length)} />
            {sabeLogins && <Resumen ok={entraron === agentes.length} rotulo="Entraron" valor={`${entraron} de ${agentes.length}`} />}
            {sabeCalendarios && <Resumen ok={conCalendario === agentes.length} rotulo="Calendario conectado" valor={`${conCalendario} de ${agentes.length}`} />}
            {setup && <Resumen ok={setup.done} rotulo="Organización" valor={setup.done ? 'configurada' : `falta ${faltaDeLaOrg.join(', ')}`} />}
            {org.data && <Resumen ok rotulo="Propiedades" valor={String(org.data.properties_count)} />}
          </ul>
        )}
      </div>
      {org.isError && <p className="text-destructive">No se pudo traer la org de Propelia: {org.error instanceof Error ? org.error.message : 'error'}</p>}
      {agentes.length > 0 && (
        <div className="w-fit max-w-full overflow-x-auto rounded-md border border-(--line) bg-card">
          <table className="w-fit">
            <thead className="bg-(--surface-2) text-left text-[11px] uppercase tracking-wide text-(--fg-muted)">
              <tr>{['Nombre', 'Usuario', 'Rol', 'Entró', 'Calendario'].map(h => <th key={h} className="px-2.5 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {agentes.map(a => (
                <tr key={a.id} className="whitespace-nowrap border-t border-(--line)">
                  <td className="px-2.5 py-1.5">{a.name}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="flex items-center gap-1">{a.email ?? '—'}
                      {a.email && (
                        <Button size="icon" variant="ghost" className="size-6 shrink-0" title={`Copiar el usuario de ${a.name}`} aria-label={`Copiar el usuario de ${a.name}`}
                          onClick={() => void copiarTexto(a.email!, 'Usuario copiado')}>
                          <Copy className="size-3" />
                        </Button>
                      )}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5">{ROLES[a.role.toLowerCase()] ?? a.role}</td>
                  <td className="px-2.5 py-1.5">
                    {!sabeLogins ? <span className="text-(--fg-muted)">—</span>
                      : a.first_sign_in_at ? <span className="font-medium text-success" title={a.last_sign_in_at ? `Última vez: ${fecha(a.last_sign_in_at)}` : undefined}>{fecha(a.first_sign_in_at)}</span>
                      : <span className="text-(--fg-muted)">Todavía no</span>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {!sabeCalendarios ? <span className="text-(--fg-muted)">—</span>
                      : a.calendar_connected ? <span className="font-medium text-success">Conectado</span>
                      : <span className="text-(--fg-muted)">Todavía no</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!org.isLoading && !org.isError && agentes.length === 0 && <p className="text-(--fg-muted)">La org no tiene usuarios todavía.</p>}
    </section>
  )
}

function Resumen({ ok, rotulo, valor, cargando }: { ok: boolean; rotulo: string; valor: string; cargando?: boolean }) {
  return (
    <li className="flex items-center gap-1">
      <span className="text-(--fg-muted)">{rotulo}:</span>
      {cargando
        ? <Loader2 className="size-3 animate-spin text-(--fg-muted)" aria-label="Cargando" />
        : <span className={ok ? 'font-medium text-success' : 'font-medium'}>{valor}</span>}
    </li>
  )
}
