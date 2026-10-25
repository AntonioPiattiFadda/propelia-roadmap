import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { mensajeDeError } from '@/pages/crm/lib/errores'
import type { NivelAcceso } from '@/pages/crm/lib/permisos'
import { setAcceso } from '@/pages/crm/service/crm.service'
import type { CrmDataAccess } from '@/pages/crm/types'
import { claveDeCelda, conAcceso, matrizVisibilidad, nivelDeCelda } from '../lib/matrizVisibilidad'

/* Copiado de propelia-frontend (src/pages/equipo/components/VisibilityMatrix.tsx) sobre
   `crm_data_access`. Filas = quién mira, columnas = de quién, celda = nada / ve / ve y edita. A
   diferencia del producto, acá el permiso SÍ muerde: lo aplica la RLS. Radix Select no admite ''
   como valor, así que «nada» viaja como 'none' y se vuelve null en el borde de la mutación.
   Ordenada el 23/10/2026: los SUPERADMIN salen de las filas (eran renglones enteros de «todo») y
   van en una línea arriba, la primera columna queda fija al scrollear y cada celda guarda sola. */
const NONE = 'none'
type CellValue = typeof NONE | NivelAcceso
const OPTIONS: Array<{ value: CellValue; label: string }> = [
  { value: NONE, label: 'Nada' }, { value: 'read', label: 'Ver' }, { value: 'write', label: 'Ver y editar' },
]
/** Cómo se ve cada valor: «Nada» se apaga para que lo concedido salte bajando por la columna. */
const ESTILO: Record<CellValue, string> = {
  none: 'text-(--fg-muted)',
  read: 'text-foreground',
  write: 'bg-(--brand-soft) text-(--brand-soft-fg) font-medium',
}
type Cambio = { viewerId: string; subjectId: string; access: NivelAcceso | null }

export function VisibilityMatrix() {
  const { usuarios, accesos, isLoading } = useCarteras()
  const qc = useQueryClient()
  // Las celdas que están guardando: se apaga solo esa, no la tabla entera.
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set())
  const marcar = (clave: string, si: boolean) => setGuardando(prev => {
    const next = new Set(prev)
    if (si) next.add(clave); else next.delete(clave)
    return next
  })

  const set = useMutation({
    mutationFn: (v: Cambio) => setAcceso(v.viewerId, v.subjectId, v.access),
    // Al toque en pantalla; si la base dice que no, vuelve a lo de antes y lo avisa.
    onMutate: async v => {
      marcar(claveDeCelda(v.viewerId, v.subjectId), true)
      await qc.cancelQueries({ queryKey: CRM_KEYS.accesos })
      const antes = qc.getQueryData<CrmDataAccess[]>(CRM_KEYS.accesos)
      qc.setQueryData<CrmDataAccess[]>(CRM_KEYS.accesos, lista => conAcceso(lista ?? [], v.viewerId, v.subjectId, v.access))
      return { antes }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CRM_KEYS.accesos, ctx.antes)
      toast.error(mensajeDeError(e))
    },
    onSettled: (_d, _e, v) => {
      marcar(claveDeCelda(v.viewerId, v.subjectId), false)
      void qc.invalidateQueries({ queryKey: CRM_KEYS.accesos })
    },
  })

  const { filas, columnas, superadmins } = useMemo(() => matrizVisibilidad(usuarios), [usuarios])

  if (isLoading) return <div className="h-48 animate-pulse rounded-lg bg-secondary" />
  if (columnas.length < 2) return <p className="text-sm text-(--fg-muted)">Hace falta más de una persona para configurar visibilidad.</p>

  return (
    <div className="flex flex-col gap-4">
      {superadmins.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-(--fg-2)">
          <span className="font-medium">Ven y editan todo:</span>
          {superadmins.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1.5"><AvatarUsuario usuario={s} />{s.nombre}</span>
          ))}
        </p>
      )}
      {filas.length === 0 ? (
        <p className="text-sm text-(--fg-muted)">Todos los activos son SUPERADMIN: no hay permisos que dar.</p>
      ) : (
        <Table className="w-auto">
          <TableHeader className="bg-(--brand-soft)">
            <TableRow>
              {/* La esquina dice cómo se lee: renglón = quién, columna = de quién. */}
              <TableHead className="sticky left-0 z-10 min-w-40 bg-(--brand-soft) text-[11.5px] font-medium leading-tight text-(--fg-2)">
                Quién ↓ · ve la cartera de →
              </TableHead>
              {columnas.map(s => (
                <TableHead key={s.id} className="w-32 min-w-32 max-w-32 px-2 text-center">
                  <span className="flex items-center justify-center gap-1.5" title={s.nombre}>
                    <AvatarUsuario usuario={s} />
                    <span className="truncate text-[12.5px]">{s.nombre}</span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(v => (
              <TableRow key={v.id}>
                <TableCell className="sticky left-0 z-10 max-w-48 bg-(--surface) [box-shadow:1px_0_0_var(--line)]">
                  <div className="flex items-center gap-2" title={v.nombre}>
                    <AvatarUsuario usuario={v} />
                    <span className="truncate text-sm font-medium">{v.nombre}</span>
                  </div>
                </TableCell>
                {columnas.map(s => {
                  // La propia no se concede: ya es suya (y la tabla lo prohíbe con un check).
                  if (v.id === s.id) return <TableCell key={s.id} className="px-2 text-center text-(--fg-muted)">—</TableCell>
                  const valor: CellValue = nivelDeCelda(accesos, v.id, s.id) ?? NONE
                  return (
                    <TableCell key={s.id} className="px-2">
                      <Select
                        value={valor}
                        disabled={guardando.has(claveDeCelda(v.id, s.id))}
                        onValueChange={next => set.mutate({ viewerId: v.id, subjectId: s.id, access: next === NONE ? null : next as NivelAcceso })}
                      >
                        <SelectTrigger size="sm" className={cn('mx-auto w-28 text-xs', ESTILO[valor])} aria-label={`Qué ve ${v.nombre} de ${s.nombre}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-(--fg-muted)">
        No es transitiva: si A ve a B y B ve a C, A no ve a C. «Ver y editar» incluye ver. Quitar un
        acceso lo corta al instante: la base deja de devolverle esos leads.
      </p>
    </div>
  )
}
