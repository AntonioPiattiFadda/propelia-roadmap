import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Props = {
  /** Nombre del servicio tal como lo ve el usuario: "Google Calendar", "Idealista"... */
  serviceName: string
  /** Promesa de la desconexión (`mutateAsync`): el diálogo se cierra sólo si resuelve. */
  onConfirm: () => Promise<unknown>
  isPending?: boolean
}

/**
 * Botón "Desconectar" de las integraciones (Google Calendar, Idealista, Fotocasa). Confirma
 * con un AlertDialog en vez de desconectar de una: perder la conexión corta la
 * sincronización y hay que volver a cargar las credenciales.
 */
export function DisconnectButton({ serviceName, onConfirm, isPending }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => setOpen(true)}
        className="hover:border-danger hover:bg-danger-soft hover:text-danger"
      >
        Desconectar
      </Button>

      {/* Mientras corre la mutación el diálogo no se cierra: cerrarlo dejaría la operación en
          vuelo sin nada en pantalla que diga que sigue pasando. */}
      <AlertDialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar {serviceName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se deja de sincronizar con {serviceName}. Para volver a usarlo vas a tener que conectarlo de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              // El default de Radix cierra al accionar: si la desconexión falla, el diálogo
              // ya no estaría y parecería que se desconectó.
              onClick={(event) => {
                event.preventDefault()
                onConfirm()
                  .then(() => setOpen(false))
                  .catch(() => {}) // el error lo muestra el onError de la mutación
              }}
              className="[background:var(--danger)] text-white hover:opacity-90"
            >
              {isPending ? 'Desconectando…' : 'Desconectar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
