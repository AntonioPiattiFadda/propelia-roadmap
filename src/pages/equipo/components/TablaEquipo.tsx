import { Link, useNavigate } from 'react-router-dom'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { enlaceAlCrm } from '@/pages/crm/lib/leadFilterParams'
import type { FilaEquipo } from '../lib/estadisticasPorCartera'

const ROL: Record<string, string> = { SUPERADMIN: 'Superadmin', SDR: 'SDR' }

/* Un renglón por cartera visible. Tocar el renglón lleva al CRM con esa cartera; tocar un número,
   al CRM ya filtrado a eso. Los enlaces salen de `enlaceAlCrm` y NUNCA se escriben a mano: en la
   URL `gestion` es la lista de EXCLUIDOS, y `?gestion=pendiente` mostraría justo lo contrario. */
function Numero({ valor, to, alerta = false }: { valor: number; to?: string; alerta?: boolean }) {
  const clase = alerta && valor > 0 ? 'font-semibold text-danger' : 'text-foreground'
  if (!to || valor === 0) return <span className={`tabular-nums ${clase}`}>{valor}</span>
  return (
    <Link to={to} onClick={e => e.stopPropagation()} className={`tabular-nums underline-offset-2 hover:underline ${clase}`}>
      {valor}
    </Link>
  )
}

function BarraEtapas({ fila }: { fila: FilaEquipo }) {
  if (fila.leadsActivos === 0) return <span className="text-[12px] text-(--fg-faint)">—</span>
  return (
    <div className="flex h-2.5 w-40 overflow-hidden rounded-full bg-(--surface-3)"
      title={fila.porEtapa.map(t => `${t.label}: ${t.cantidad}`).join(' · ')}>
      {fila.porEtapa.map(t => (
        <span key={t.etapaId ?? 'sin'} style={{ width: `${(t.cantidad / fila.leadsActivos) * 100}%`, background: t.color }} />
      ))}
    </div>
  )
}

export function TablaEquipo({ filas }: { filas: FilaEquipo[] }) {
  const navigate = useNavigate()
  const th = 'whitespace-nowrap bg-(--surface-2) px-4 py-[7px] text-left text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2) shadow-[inset_0_-1px_0_var(--line-strong)]'
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Cartera</th><th className={th}>Rol</th><th className={th}>Leads activos</th>
            <th className={th}>Por etapa</th><th className={th}>Gestiones vencidas</th>
            <th className={th}>Leads con tareas vencidas</th><th className={th}>Reuniones este mes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const owners = [f.usuario.id]
            return (
              <tr key={f.usuario.id} onClick={() => navigate(enlaceAlCrm({ owners }))}
                className="cursor-pointer [border-bottom:1px_solid_var(--line-soft)] hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <AvatarUsuario usuario={f.usuario} />
                    <span className="text-[14px] font-medium">{f.usuario.nombre}</span>
                    {!f.usuario.activo && <span className="text-[12px] text-(--fg-muted)">(inactivo)</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] text-(--fg-2)">{ROL[f.usuario.rol] ?? f.usuario.rol}</td>
                <td className="px-4 py-3"><Numero valor={f.leadsActivos} to={enlaceAlCrm({ owners })} /></td>
                <td className="px-4 py-3"><BarraEtapas fila={f} /></td>
                <td className="px-4 py-3"><Numero valor={f.gestionesVencidas} alerta to={enlaceAlCrm({ owners, gestion: 'pendiente' })} /></td>
                <td className="px-4 py-3"><Numero valor={f.leadsConTareasVencidas} alerta to={enlaceAlCrm({ owners, overdueOnly: true })} /></td>
                {/* Sin enlace: la agenda de reuniones está fuera de alcance (spec §8). */}
                <td className="px-4 py-3"><Numero valor={f.reunionesMes} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
