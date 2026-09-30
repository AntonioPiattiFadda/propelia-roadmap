import { Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { ChannelsPanel } from './ChannelsPanel'

/* El del producto se anida en el asistente de alta y por eso arma su velo a mano (modal={false});
   acá se abre desde la cabecera y es un Dialog común. */
export function ManageChannelsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={Radio} size="xs" />
          Canales
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Canales de origen</DialogTitle>
          <DialogDescription>Por dónde llegó cada inmobiliaria. Arrastrá para reordenar.</DialogDescription>
        </DialogHeader>
        <ChannelsPanel />
      </DialogContent>
    </Dialog>
  )
}
