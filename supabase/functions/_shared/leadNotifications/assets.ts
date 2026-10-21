// Puro (sin Deno ni jsr): lo prueba el front con vitest.

/**
 * Base de los PNG del mail (íconos Lucide y decoración). Desde el 21/10/2026 viven en esta app:
 * `public/email/avisos/`, que Vercel sirve en `{APP_BASE_URL}/email/avisos` (los estáticos van antes
 * que el rewrite de la SPA). Ahí está `header-corner-brand.png`, las burbujas en azul del tema
 * 'acento', que el bucket del producto no tiene. Sin APP_BASE_URL cae al bucket público
 * `email-assets/v2` de `propelia-frontend` (íconos de siempre, sin las burbujas azules).
 * `EMAIL_ASSETS_BASE_URL` pisa todo.
 */
export const emailAssetsBaseUrl = (override?: string, appBaseUrl?: string) =>
  override?.trim() ||
  (appBaseUrl?.trim() ? `${appBaseUrl.trim().replace(/\/+$/, '')}/email/avisos` : '') ||
  'https://gvkdyxhxsnpumxlhvhsm.supabase.co/storage/v1/object/public/email-assets/v2'
