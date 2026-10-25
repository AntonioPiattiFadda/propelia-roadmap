import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutDashboard, List, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { AgentFilterButton } from './components/AgentFilterButton'
import { CampanaDeEmails } from './components/EmailsQueNoLlegaron'
import { ContadorDeLlamadas } from './components/ContadorDeLlamadas'
import { CrmLeadList } from './components/CrmLeadList'
import { FunnelConfigDialog } from './components/FunnelConfigDialog'
import { ImportarLoteDialog } from './components/ImportarLoteDialog'
import { ManageChannelsDialog } from './components/ManageChannelsDialog'
import { MenuDeHerramientas } from './components/MenuDeHerramientas'
import { NewLeadDialog } from './components/NewLeadDialog'
import { TestEmailDialog } from './components/TestEmailDialog'
import { PlanningDiarioDialog } from './components/PlanningDiarioDialog'
import { PlaybookDialog } from './components/PlaybookDialog'
import { CartelVerComo, VerComoButton } from './components/VerComo'
import { useCarteras } from './hooks/useCarteras'
import { useVerComo } from './hooks/useVerComo'
import { useCrmRealtime } from './hooks/useCrmRealtime'
import { deleteLeadFilterParams, escribirLeadAbierto, LEAD_FILTER_PARAMS_WITH_QUERY } from './lib/leadFilterParams'
import { escribirResumen, fijarResumenEnLaUrl, muestraResumen } from './lib/resumen'

/* Cabecera (carteras, funnel, canales, + Nuevo lead) y la lista. El realtime se abre acá y no en
   la lista: vive lo que vive la página. */
export function Crm() {
  const { esSuperadmin, isLoading: cargandoPermisos } = useCarteras()
  const { como, cargando: cargandoComo } = useVerComo()
  useCrmRealtime()
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  // El resumen (23/10/2026): lo primero que ve un SUPERADMIN en /crm pelado. Hasta saber quién soy
  // no se decide nada: pintar la lista y saltar al resumen es un parpadeo y dos consultas de más.
  const quien = { esSuperadmin, como: !!como }
  const decidido = !cargandoPermisos && !cargandoComo
  const resumen = decidido && muestraResumen(searchParams, quien)
  // Lo decidido queda escrito (`?resumen=1|0`): abrir un lead desde el resumen o limpiar los
  // filtros de la lista no cambian de vista solos (ver `fijarResumenEnLaUrl`).
  const fijar = decidido ? fijarResumenEnLaUrl(searchParams, quien)?.toString() ?? null : null
  useEffect(() => {
    if (fijar !== null) setSearchParams(new URLSearchParams(fijar), { replace: true })
  }, [fijar, setSearchParams])
  // Un solo botón que alterna, en el mismo lugar de la cabecera en las dos vistas. A la lista se
  // llega sin filtros ni lead abierto; al Dashboard, sin lead abierto (los filtros se quedan para la vuelta).
  const alternarVista = () => setSearchParams(prev => (resumen
    ? escribirResumen(deleteLeadFilterParams(escribirLeadAbierto(prev, null), LEAD_FILTER_PARAMS_WITH_QUERY), false)
    : escribirResumen(escribirLeadAbierto(prev, null), true)))
  // Recién creado, se abre: lo próximo que se hace con un lead nuevo es trabajarlo.
  const abrir = (leadId: string) => setSearchParams(prev => escribirLeadAbierto(prev, leadId), { replace: true })

  return (
    // `ui-scale-md`: la escala del producto en escritorio y 1 en el teléfono (objetivos táctiles).
    <div className="ui-scale-md flex flex-col">
      <CartelVerComo />
      <header className="flex items-center justify-end gap-2 px-4 pb-2 pt-3 max-md:px-2">
        <h1 className="mr-auto text-lg font-semibold text-foreground">CRM</h1>
        <MenuDeHerramientas>
          {/* Para todos, SDR incluido: es la jornada contra la que se trabaja la lista. */}
          <PlanningDiarioDialog />
          <PlaybookDialog />
          <VerComoButton />
          {/* Solo SUPERADMIN (la RLS lo exige igual): un SDR que renombra una etapa desarma el
              funnel de todos. En el teléfono no: se configura una vez al mes, desde el escritorio. */}
          {esSuperadmin && (
            <div className="hidden md:contents">
              {/* Importar lotes también es de escritorio y de SUPERADMIN: la RPC lo exige igual. */}
              <ImportarLoteDialog />
              {/* Para probar el envío de emails (info@propelia.es); la edge function lo exige igual. */}
              <TestEmailDialog />
              <FunnelConfigDialog />
              <ManageChannelsDialog />
            </div>
          )}
        </MenuDeHerramientas>
        {/* Mirando como alguien, la vista es su cartera: el selector sobra (y `?owners=` sigue andando). */}
        {/* En el resumen tampoco: muestra todas las carteras. */}
        {!como && !resumen && <AgentFilterButton />}
        {/* Dashboard ⇄ lista: solo SUPERADMIN (y no con «Ver como», que no tiene Dashboard). */}
        {decidido && esSuperadmin && !como && (
          <Button variant="outline" onClick={alternarVista}
            title={resumen ? 'La lista de leads, con sus filtros' : 'Leads importantes y agenda de todas las carteras'}>
            <Icon icon={resumen ? List : LayoutDashboard} size="xs" />
            <span className="hidden md:inline">{resumen ? 'Ver lista de leads' : 'Dashboard'}</span>
            <span className="md:hidden">{resumen ? 'Lista' : 'Dashboard'}</span>
          </Button>
        )}
        {/* Notificaciones: tus emails que rebotaron o no salieron; tocar uno abre el lead. */}
        <CampanaDeEmails />
        <Button onClick={() => setAltaAbierta(true)}>
          <Icon icon={PlusIcon} size="xs" />
          <span className="hidden md:inline">Nuevo lead</span>
          <span className="md:hidden">Nuevo</span>
        </Button>
      </header>
      <div className="px-4 pb-2 max-md:px-2">
        <ContadorDeLlamadas />
      </div>
      <div className="p-1 max-md:p-0">
        {/* Sin saber todavía si hay resumen, solo la carga: la lista tampoco pinta nada sin sesión. */}
        {decidido
          ? <CrmLeadList resumen={resumen} />
          : (
            <div className="flex flex-col gap-2 px-3" aria-busy="true">
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-secondary" />)}
            </div>
          )}
      </div>
      <NewLeadDialog open={altaAbierta} onOpenChange={setAltaAbierta} onCreado={abrir} />
    </div>
  )
}
