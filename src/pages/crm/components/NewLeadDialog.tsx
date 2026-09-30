import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { localTodayIso } from '@/lib/calendarDate'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCrearLead } from '../hooks/useLeadMutaciones'
import { EMPTY_CLIENT, validateClientData, type ClientData, type ClientDataErrors } from '../lib/clientData'
import { mensajeDeError } from '../lib/errores'
import { ClientFields } from './ClientFields'

const SIN_CANAL = '__sin_canal__'

/**
 * NUEVO: la versión chica de NewLeadWizard del producto. Un paso: empresa, contacto, teléfono,
 * email, canal y responsable. Contra `crm_create_lead_with_client`, que reutiliza el cliente si ya
 * existe (aunque sea de otra cartera) y crea la tarea «Asesorar cliente» con vencimiento HOY —el
 * hoy de quien carga, por eso la fecha sale de acá y no del servidor—.
 */
export function NewLeadDialog({ open, onOpenChange, onCreado }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreado?: (leadId: string) => void
}) {
  const { myId, conEscritura } = useCarteras()
  const { canalesActivos } = useCrmCatalogos()
  const crear = useCrearLead()
  const [data, setData] = useState<ClientData>(EMPTY_CLIENT)
  const [errors, setErrors] = useState<ClientDataErrors>({})
  const [canal, setCanal] = useState(SIN_CANAL)
  const [responsable, setResponsable] = useState('')
  const [errorBase, setErrorBase] = useState<string | null>(null)
  // Yo por defecto. Si no tengo write sobre mí mismo (inactivo) no hay a quién: el botón se apaga.
  const responsableId = responsable || (conEscritura.some(u => u.id === myId) ? myId ?? '' : '')

  const cerrar = (v: boolean) => {
    if (!v) { setData(EMPTY_CLIENT); setErrors({}); setCanal(SIN_CANAL); setResponsable(''); setErrorBase(null) }
    onOpenChange(v)
  }

  const enviar = async () => {
    const errs = validateClientData(data)
    // Un lead sin empresa ni persona no se reconoce en la lista.
    if (!data.company_name.trim() && !data.first_name.trim()) errs.company_name = 'Poné la empresa o el nombre'
    setErrors(errs)
    if (Object.keys(errs).length > 0 || !responsableId) return
    setErrorBase(null)
    try {
      const r = await crear.mutateAsync({
        assignedTo: responsableId,
        initialTaskDueDate: localTodayIso(),
        companyName: data.company_name,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone,
        channelId: canal === SIN_CANAL ? null : canal,
        funnelStageId: null,
      })
      cerrar(false)
      onCreado?.(r.lead_id)
    } catch (e) {
      // Adentro del dialog y no en un toast: el que tiene que corregir algo está mirando el formulario.
      setErrorBase(mensajeDeError(e, 'No se pudo crear el lead.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-[560px] max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none">
        <DialogHeader>
          <DialogTitle>Nuevo lead</DialogTitle>
          <DialogDescription>Si el teléfono o el email ya son de un cliente, se reutiliza.</DialogDescription>
        </DialogHeader>
        <ClientFields data={data} errors={errors} onChange={patch => setData(d => ({ ...d, ...patch }))} />
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <div className="flex flex-col gap-1">
            <Label className="text-[12.5px] font-semibold">Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CANAL}>Sin canal</SelectItem>
                {canalesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Solo si hay dónde elegir: un SDR sin accesos carga siempre en su cartera. */}
          {conEscritura.length > 1 && (
            <div className="flex flex-col gap-1">
              <Label className="text-[12.5px] font-semibold">Responsable</Label>
              <Select value={responsableId} onValueChange={setResponsable}>
                <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                <SelectContent>
                  {conEscritura.map(u => <SelectItem key={u.id} value={u.id}>{u.id === myId ? `${u.nombre} (vos)` : u.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {errorBase && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorBase}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
          <Button onClick={() => void enviar()} disabled={crear.isPending || !responsableId}>
            {crear.isPending ? 'Creando…' : 'Crear lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
