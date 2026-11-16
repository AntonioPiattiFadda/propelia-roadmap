import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { DescartarLeadDialog } from './DescartarLeadDialog'

/**
 * Pasar un lead a «Buscar contacto» pregunta si cualifica (16/11/2026, por pedido): el equipo le
 * va a buscar un contacto, y eso solo vale la pena si el lead cualifica. «Cualifica» lo deja en
 * Buscar contacto; «No cualifica» abre el DescartarLeadDialog de siempre. La etapa ya se movió
 * antes de preguntar: cerrar sin contestar o cancelar el descarte lo deja en Buscar contacto.
 */
export function CualificaLeadDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { descartada } = useCrmCatalogos()
  const [descartando, setDescartando] = useState(false)

  if (descartando && descartada) return <DescartarLeadDialog leadId={leadId} etapa={descartada} onClose={onClose} />

  return (
    <AlertDialog open onOpenChange={abierto => { if (!abierto) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿El lead cualifica?</AlertDialogTitle>
          <AlertDialogDescription>
            Si cualifica, queda en «Buscar contacto» y el equipo le busca uno. Si no cualifica, descartalo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={!descartada}
            onClick={e => { e.preventDefault(); setDescartando(true) }}
          >
            No cualifica
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => { toast.success('Queda en «Buscar contacto»'); onClose() }}>
            Cualifica
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
