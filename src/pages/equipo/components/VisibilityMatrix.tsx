import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { mensajeDeError } from '@/pages/crm/lib/errores'
import type { NivelAcceso } from '@/pages/crm/lib/permisos'
import { setAcceso } from '@/pages/crm/service/crm.service'

/* Copiado de propelia-frontend (src/pages/equipo/components/VisibilityMatrix.tsx) sobre
   `crm_data_access`. Filas = quién mira, columnas = a quién, celda = nada / ve / ve y edita. A
   diferencia del producto, acá el permiso SÍ muerde: lo aplica la RLS. Radix Select no admite ''
   como valor, así que «nada» viaja como 'none' y se vuelve null en el borde de la mutación. */
const NONE = 'none'
type CellValue = typeof NONE | NivelAcceso
const OPTIONS: Array<{ value: CellValue; label: string }> = [
  { value: NONE, label: 'Nada' }, { value: 'read', label: 'Ver' }, { value: 'write', label: 'Ver y editar' },
]

export function VisibilityMatrix() {
  const { usuarios, accesos, isLoading } = useCarteras()
  const qc = useQueryClient()
  const set = useMutation({
    mutationFn: (v: { viewerId: string; subjectId: string; access: NivelAcceso | null }) => setAcceso(v.viewerId, v.subjectId, v.access),
    onError: e => toast.error(mensajeDeError(e)),
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.accesos }) },
  })
  // Solo activos: un inactivo no puede nada (es_usuario), darle permisos no cambiaría nada.
  const activos = usuarios.filter(u => u.activo)
  const nivel = (viewer: string, subject: string): CellValue =>
    (accesos.find(a => a.viewer_id === viewer && a.subject_id === subject)?.access as NivelAcceso | undefined) ?? NONE

  if (isLoading) return <div className="h-48 animate-pulse rounded-lg bg-secondary" />
  if (activos.length < 2) return <p className="text-sm text-(--fg-muted)">Hace falta más de una persona para configurar visibilidad.</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-(--brand-soft)">
            <TableRow>
              <TableHead className="whitespace-nowrap">Ve la cartera de</TableHead>
              {activos.map(s => (
                <TableHead key={s.id} className="whitespace-nowrap text-center">
                  <span className="flex items-center justify-center gap-1.5"><AvatarUsuario usuario={s} />{s.nombre}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activos.map(v => (
              <TableRow key={v.id}>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2.5"><AvatarUsuario usuario={v} /><span className="text-sm font-medium">{v.nombre}</span></div>
                </TableCell>
                {activos.map(s => v.id === s.id ? (
                  // La propia no se concede: ya es suya (y la tabla lo prohíbe con un check).
                  <TableCell key={s.id} className="text-center text-(--fg-muted)">—</TableCell>
                ) : v.rol === 'SUPERADMIN' ? (
                  // Un SUPERADMIN ve y edita todo por su rol: una fila acá no le cambiaría nada.
                  <TableCell key={s.id} className="text-center text-[12px] text-(--fg-muted)">todo</TableCell>
                ) : (
                  <TableCell key={s.id}>
                    <Select
                      value={nivel(v.id, s.id)}
                      disabled={set.isPending}
                      onValueChange={next => set.mutate({ viewerId: v.id, subjectId: s.id, access: next === NONE ? null : next as NivelAcceso })}
                    >
                      <SelectTrigger size="sm" className="w-full min-w-32 text-xs" aria-label={`Qué ve ${v.nombre} de ${s.nombre}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-(--fg-muted)">
        No es transitiva: si A ve a B y B ve a C, A no ve a C. «Ver y editar» incluye ver. Quitar un
        acceso lo corta al instante: la base deja de devolverle esos leads.
      </p>
    </div>
  )
}
