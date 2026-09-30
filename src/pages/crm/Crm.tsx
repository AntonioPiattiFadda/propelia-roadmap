import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { AgentFilterButton } from './components/AgentFilterButton'
import { CrmLeadList } from './components/CrmLeadList'
import { FunnelConfigDialog } from './components/FunnelConfigDialog'
import { ManageChannelsDialog } from './components/ManageChannelsDialog'
import { NewLeadDialog } from './components/NewLeadDialog'
import { useCarteras } from './hooks/useCarteras'
import { useCrmRealtime } from './hooks/useCrmRealtime'
import { escribirLeadAbierto } from './lib/leadFilterParams'

/* Cabecera (carteras, funnel, canales, + Nuevo lead) y la lista. El realtime se abre acá y no en
   la lista: vive lo que vive la página. */
export function Crm() {
  const { esSuperadmin } = useCarteras()
  useCrmRealtime()
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [, setSearchParams] = useSearchParams()
  // Recién creado, se abre: lo próximo que se hace con un lead nuevo es trabajarlo.
  const abrir = (leadId: string) => setSearchParams(prev => escribirLeadAbierto(prev, leadId), { replace: true })

  return (
    // `ui-scale-md`: la escala del producto en escritorio y 1 en el teléfono (objetivos táctiles).
    <div className="ui-scale-md flex flex-col">
      <header className="flex items-center justify-end gap-2 px-4 pb-2 pt-3 max-md:px-2">
        <h1 className="mr-auto text-lg font-semibold text-foreground">CRM</h1>
        <AgentFilterButton />
        {/* Solo SUPERADMIN (la RLS lo exige igual): un SDR que renombra una etapa desarma el
            funnel de todos. En el teléfono no: se configura una vez al mes, desde el escritorio. */}
        {esSuperadmin && (
          <div className="hidden md:contents">
            <FunnelConfigDialog />
            <ManageChannelsDialog />
          </div>
        )}
        <Button onClick={() => setAltaAbierta(true)}>
          <Icon icon={PlusIcon} size="xs" />
          <span className="hidden md:inline">Nuevo lead</span>
          <span className="md:hidden">Nuevo</span>
        </Button>
      </header>
      <div className="p-1 max-md:p-0">
        <CrmLeadList />
      </div>
      <NewLeadDialog open={altaAbierta} onOpenChange={setAltaAbierta} onCreado={abrir} />
    </div>
  )
}
