import { urlDelLegacy, type VistaLegacy } from './legacy'

type Props = { vista: VistaLegacy; titulo: string }

/* Mismo origen, así que la sesión de Supabase se comparte sola por `localStorage`: el iframe
   entra con la cuenta con la que se entró acá, sin volver a pedir contraseña. `ui-screen-h`
   es el alto de pantalla menos la barra de pestañas del teléfono (index.css).

   `key` por vista: sin ella, pasar de Roadmap a Backlog cambiaría el `src` del mismo iframe y
   React conservaría el nodo; con ella cada ruta arranca su tablero de cero en la vista pedida. */
export function TableroLegacy({ vista, titulo }: Props) {
  return (
    <div className="ui-screen-h w-full">
      <iframe key={vista} src={urlDelLegacy(vista)} title={titulo} className="block h-full w-full border-0" />
    </div>
  )
}
