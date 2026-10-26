import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { crearOrgConUsuarios, PUENTE_SIMULADO } from '../service/puente'
import { useImportarEquipo } from '../hooks/useClientes'
import { sePuedeImportar, type ExcelDeUsuarios } from '../lib/usuariosExcel'
import type { DatosDelAlta } from './datosDelAlta'

const ROL = { admin: 'Administrador', agent: 'Agente' } as const

/* La vista previa del Excel de usuarios y el import (paso 1). Todo o nada: con una fila con error
   no se habilita. Importar es dos llamadas en orden: el puente crea la org y las cuentas en
   Propelia y después `client_onboarding_importar_equipo` guarda el equipo, vincula la org al lead
   y tilda las dos tareas. Si la segunda falla, la org ya existe: el error lo dice con su id. */
export function ImportarUsuariosPanel({ datos, archivo, excel, onCerrar }: {
  datos: DatosDelAlta; archivo: string; excel: ExcelDeUsuarios; onCerrar: () => void
}) {
  const [nombreOrg, setNombreOrg] = useState(datos.inmobiliaria)
  const [enCurso, setEnCurso] = useState(false)
  const importar = useImportarEquipo()

  if (!excel.ok) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px]">
        <p><b>{archivo}</b> no se puede leer: {excel.error}</p>
        <Button size="sm" variant="outline" className="self-start" onClick={onCerrar}>Cerrar</Button>
      </div>
    )
  }
  const listo = sePuedeImportar(excel) && nombreOrg.trim() !== ''

  const confirmar = async () => {
    setEnCurso(true)
    let orgId: string | null = null
    try {
      const { organization } = await crearOrgConUsuarios(nombreOrg.trim(), excel.filas.map(f => ({
        first_name: f.nombre, last_name: f.apellido, email: f.email, phone: f.telefono, role: f.rol, is_owner: f.responsable, password: f.contrasena,
      })))
      orgId = organization.id
      await importar.mutateAsync({
        onboardingId: datos.o.id, organizationId: organization.id,
        miembros: excel.filas.map(f => ({ first_name: f.nombre, last_name: f.apellido, email: f.email, phone: f.telefono, role: f.rol, is_owner: f.responsable })),
      })
      toast.success(`${organization.name}: organización y ${excel.filas.length} cuentas creadas`,
        PUENTE_SIMULADO ? { description: 'Puente simulado: en Propelia no se creó nada todavía.' } : undefined)
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
        <span className="text-(--fg-muted)">{archivo} · {excel.filas.length} {excel.filas.length === 1 ? 'persona' : 'personas'}</span>
        <label className="ml-auto flex items-center gap-2 text-(--fg-2)">
          Nombre de la inmobiliaria
          <Input value={nombreOrg} onChange={e => setNombreOrg(e.target.value)} className="h-8 w-56 bg-card" />
        </label>
      </div>
      {excel.errorGeneral && <p className="text-[13px] font-medium text-destructive">{excel.errorGeneral}</p>}
      <div className="overflow-x-auto rounded-md border border-(--line) bg-card">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead className="bg-(--surface-2) text-left text-[11px] uppercase tracking-wide text-(--fg-muted)">
            <tr>{['Fila', 'Nombre', 'Email', 'Teléfono', 'Rol', 'Contraseña', ''].map(h => <th key={h} className="px-2.5 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {excel.filas.map(f => (
              <tr key={f.fila} className="border-t border-(--line) align-top">
                <td className="px-2.5 py-2 tabular-nums text-(--fg-muted)">{f.fila}</td>
                <td className="px-2.5 py-2">
                  {f.nombre} {f.apellido}
                  {f.responsable && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Responsable</span>}
                </td>
                <td className="px-2.5 py-2">{f.email}</td>
                <td className="px-2.5 py-2 tabular-nums">{f.telefono}</td>
                <td className="px-2.5 py-2">{ROL[f.rol]}</td>
                <td className="px-2.5 py-2 font-mono text-[12px]">{f.contrasena}</td>
                <td className={cn('px-2.5 py-2 text-[12px]', f.errores.length ? 'text-destructive' : 'text-success')}>
                  {f.errores.length ? f.errores.join(' · ') : 'Lista'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!listo || enCurso} onClick={() => void confirmar()}>
          {enCurso && <Loader2 className="size-4 animate-spin" />}
          Crear organización y {excel.filas.length} {excel.filas.length === 1 ? 'cuenta' : 'cuentas'}
        </Button>
        <Button size="sm" variant="outline" disabled={enCurso} onClick={onCerrar}>Cancelar</Button>
        <span className="text-[12px] text-(--fg-muted)">
          {listo ? 'La contraseña es automática: nombre.apellido.' : 'Todo o nada: corregí el Excel y volvé a subirlo.'}
        </span>
      </div>
    </div>
  )
}
