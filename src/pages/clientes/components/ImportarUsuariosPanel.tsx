import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { crearOrgConUsuarios, PUENTE_SIMULADO } from '../service/puente'
import { useImportarEquipo } from '../hooks/useClientes'
import { contrasenaInicial, normalizarWeb } from '../lib/equipo'
import type { DatosDelAlta } from './datosDelAlta'

const ROL = { admin: 'Administrador', agent: 'Agente' } as const

/* La vista previa del equipo que envió el cliente desde la página de alta, y el import (paso 1).
   Lo enviado ya pasó las reglas de la base (`onboarding_alta_enviar`): un responsable que es
   Administrador, emails válidos y sin repetir, teléfono en E.164. Importar es dos llamadas en
   orden: el puente crea la org y las cuentas en Propelia y después `client_onboarding_importar_equipo`
   vuelve a guardar el equipo, vincula la org al lead y tilda las dos tareas. Si la segunda falla,
   la org ya existe: el error lo dice con su id. La web que cargó el cliente (editable acá) va con la
   org y queda en su configuración en Propelia (28/10/2026, por pedido). */
export function ImportarUsuariosPanel({ datos, onCerrar }: { datos: DatosDelAlta; onCerrar: () => void }) {
  const [nombreOrg, setNombreOrg] = useState(datos.inmobiliaria)
  const [web, setWeb] = useState(datos.o.website ?? '')
  const webNormalizada = normalizarWeb(web)
  const [enCurso, setEnCurso] = useState(false)
  const importar = useImportarEquipo()
  // El responsable primero, como en la página.
  const miembros = [...datos.o.miembros]
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.created_at.localeCompare(b.created_at))
    .map(m => ({ ...m, rol: m.role as keyof typeof ROL, contrasena: contrasenaInicial(m.first_name, m.last_name, new Date(m.created_at).getFullYear()) }))
  const listo = nombreOrg.trim() !== '' && miembros.length > 0 && webNormalizada !== undefined

  const confirmar = async () => {
    setEnCurso(true)
    let orgId: string | null = null
    try {
      const { organization } = await crearOrgConUsuarios(nombreOrg.trim(), miembros.map(m => ({
        first_name: m.first_name, last_name: m.last_name, email: m.email ?? '', phone: m.phone ?? '', role: m.rol, is_owner: m.is_owner, password: m.contrasena,
      })), webNormalizada ?? null)
      orgId = organization.id
      await importar.mutateAsync({
        onboardingId: datos.o.id, organizationId: organization.id,
        miembros: miembros.map(m => ({ first_name: m.first_name, last_name: m.last_name, email: m.email ?? '', phone: m.phone ?? '', role: m.rol, is_owner: m.is_owner })),
      })
      // La web no frena el alta: si no se guardó, se avisa y se carga en Ajustes › Marca de Propelia.
      const sinWeb = webNormalizada && !organization.website
      toast.success(`${organization.name}: organización y ${miembros.length} cuentas creadas`, {
        description: PUENTE_SIMULADO ? 'Puente simulado: en Propelia no se creó nada todavía.'
          : sinWeb ? 'La web no se guardó: cargala en Ajustes › Marca de Propelia.' : undefined,
      })
      onCerrar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      toast.error(orgId ? 'La org se creó en Propelia pero no quedó guardada acá' : 'No se pudo importar', {
        description: orgId ? `${msg} · org ${orgId}` : msg, duration: Infinity, closeButton: true,
      })
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-(--line) bg-(--surface-2) p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
        <b>Vista previa</b>
        <span className="text-(--fg-muted)">{miembros.length} {miembros.length === 1 ? 'persona' : 'personas'}</span>
        <label className="ml-auto flex items-center gap-2 text-(--fg-2)">
          Nombre de la inmobiliaria
          <Input value={nombreOrg} onChange={e => setNombreOrg(e.target.value)} className="h-8 w-56 bg-card" />
        </label>
        <label className="flex items-center gap-2 text-(--fg-2)">
          Web
          <Input value={web} onChange={e => setWeb(e.target.value)} placeholder="Opcional" aria-invalid={webNormalizada === undefined}
            title={webNormalizada === undefined ? 'No es una web válida (ej. fincasribera.es)' : 'Queda en la configuración de la org en Propelia'}
            className="h-8 w-52 bg-card" />
        </label>
      </div>
      <div className="overflow-x-auto rounded-md border border-(--line) bg-card">
        <table className="w-full min-w-[600px] text-[12.5px]">
          <thead className="bg-(--surface-2) text-left text-[11px] uppercase tracking-wide text-(--fg-muted)">
            <tr>{['Nombre', 'Email', 'Teléfono', 'Rol', 'Contraseña'].map(h => <th key={h} className="px-2.5 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {miembros.map(m => (
              <tr key={m.id} className="border-t border-(--line) align-top">
                <td className="px-2.5 py-2">
                  {m.first_name} {m.last_name}
                  {m.is_owner && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Responsable</span>}
                </td>
                <td className="px-2.5 py-2">{m.email}</td>
                <td className="px-2.5 py-2 tabular-nums">{m.phone}</td>
                <td className="px-2.5 py-2">{ROL[m.rol]}</td>
                <td className="px-2.5 py-2 font-mono text-[12px]">{m.contrasena}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!listo || enCurso} onClick={() => void confirmar()}>
          {enCurso && <Loader2 className="size-4 animate-spin" />}
          Crear organización y {miembros.length} {miembros.length === 1 ? 'cuenta' : 'cuentas'}
        </Button>
        <Button size="sm" variant="outline" disabled={enCurso} onClick={onCerrar}>Cancelar</Button>
        <span className="text-[12px] text-(--fg-muted)">La contraseña es automática: nombre.apellido.</span>
      </div>
    </div>
  )
}
