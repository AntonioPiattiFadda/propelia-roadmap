import type { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

const GOOGLE_SETTINGS_PATH = '/ajustes?tab=integraciones&highlight=google-calendar'

/** Toast de error con acción "Ir a Ajustes" — misma forma en cancelar y sincronizar. */
export function notifyNoGoogleConnection(navigate: ReturnType<typeof useNavigate>) {
  toast.error('Conectá tu cuenta de Google Calendar en Ajustes para sincronizar esta reunión', {
    action: {
      label: 'Ir a Ajustes',
      onClick: () => navigate(GOOGLE_SETTINGS_PATH),
    },
  })
}
