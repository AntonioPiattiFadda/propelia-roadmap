import { AgentFilterButton } from './components/AgentFilterButton'
import { CrmLeadList } from './components/CrmLeadList'
import { useCrmRealtime } from './hooks/useCrmRealtime'

/* Cabecera (carteras, funnel, canales, + Nuevo lead) y la lista. El realtime se abre acá y no en
   la lista: vive lo que vive la página. */
export function Crm() {
  useCrmRealtime()
  return (
    // `ui-scale-md`: la escala del producto en escritorio y 1 en el teléfono (objetivos táctiles).
    <div className="ui-scale-md flex flex-col">
      <header className="flex items-center justify-end gap-2 px-4 pb-2 pt-3 max-md:px-2">
        <h1 className="mr-auto text-lg font-semibold text-foreground">CRM</h1>
        <AgentFilterButton />
      </header>
      <div className="p-1 max-md:p-0">
        <CrmLeadList />
      </div>
    </div>
  )
}
