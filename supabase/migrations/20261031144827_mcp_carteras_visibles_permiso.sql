-- Arreglo de 20261031141933_mcp_demos_y_rendimiento: esa migración le sacó a `authenticated` el
-- permiso de ejecutar `mcp_carteras_visibles()` creyendo que las vistas la corrían como su dueño.
-- No: en Postgres la vista lee las TABLAS con los permisos del dueño, pero el EXECUTE de una función
-- que llama se chequea contra quien consulta. Resultado: todas las vistas del CRM del MCP fallaban
-- con «permission denied for function mcp_carteras_visibles» (31/10/2026, visto en list_demos).
--
-- Dárselo a `authenticated` no abre nada: devuelve las carteras que el propio usuario ya puede ver
-- (lo mismo que contesta `crm_puede()`), y el conector igual no puede llamarla por RPC porque no
-- está en `mcp_oauth_rpcs()`.

grant execute on function public.mcp_carteras_visibles() to authenticated;
