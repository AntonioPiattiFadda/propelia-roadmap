// Lo único que el token del conector puede leer de la base: las vistas `mcp_*` y las RPC de
// abajo. Es la misma lista que `public.mcp_oauth_relations()` / `public.mcp_oauth_rpcs()`
// (migración 20261030115614_mcp_oauth_infra): fuera de ella la base devuelve 403 (por path) o
// cero filas (RLS restrictiva, también en embeds).
//
// Las vistas son de 20261031135450_mcp_tools. Ninguna tabla real va acá: la lista blanca es por
// tabla, así que una tabla entera expondría todas sus columnas. Para entregar algo se crea una
// vista con sólo lo que se puede dar.
//
// Agregar una vista = agregarla acá Y en una migración nueva que la cree y redefina
// mcp_oauth_relations() completa. Lo mismo con las RPC (MCP_RPCS ↔ mcp_oauth_rpcs()), que el
// conector sólo puede llamar por GET.

export const MCP_RELATIONS = [
  'mcp_team', 'mcp_roadmap_tareas', 'mcp_roadmap_grupos', 'mcp_crm_stages', 'mcp_crm_leads',
  'mcp_crm_tasks', 'mcp_crm_meetings', 'mcp_crm_comments', 'mcp_crm_stage_history',
  'mcp_onboardings', 'mcp_expenses',
] as const

export type McpRelation = (typeof MCP_RELATIONS)[number]

export const MCP_RPCS = ['mcp_whoami'] as const

export type McpRpc = (typeof MCP_RPCS)[number]
