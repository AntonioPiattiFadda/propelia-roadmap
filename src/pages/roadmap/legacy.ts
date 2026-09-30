/* El tablero vanilla (`legacy/`) se sirve tal cual bajo `/legacy/` (ver `servirLegacy` en
   vite.config.ts) y se mete adentro de la app en un iframe mientras el port no esté hecho.

   `embed=1` le dice que no dibuje su propia navegación —la barra lateral y la de pestañas
   del teléfono—: a dónde ir lo dice la de React, y dos lugares para lo mismo son dos lugares
   que hay que aprenderse. `vista` elige cuál de las suyas abre; el id es el de `VISTAS` en
   legacy/app.js, no el de la ruta. */
export type VistaLegacy = 'estado' | 'backlog'

export const urlDelLegacy = (vista: VistaLegacy) => `/legacy/index.html?embed=1&vista=${vista}`
