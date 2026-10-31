/**
 * El registro dinámico de clientes está abierto: cualquiera puede registrar una app con el
 * nombre que quiera ("Propelia Oficial") y mandarle el link a un usuario. El nombre no prueba
 * nada; a DÓNDE vuelve el código sí, porque eso no se puede falsificar. Por eso sólo se
 * puede aprobar si vuelve a un cliente conocido (Claude o ChatGPT): así el código siempre
 * llega a esa app (y con PKCE), nunca a un tercero, aunque la app se llame como sea.
 *
 * Callbacks de Claude (https://claude.com/docs/connectors/building/authentication):
 * - web, Desktop, mobile: exactamente https://claude.ai/api/mcp/auth_callback
 * - Claude Code: loopback http://localhost|127.0.0.1:<puerto>/callback (aviso extra: cualquier
 *   proceso local puede abrir un puerto, lo pide la spec de MCP)
 *
 * Callbacks de ChatGPT (apps / conectores en developer mode). Las fuentes públicas no coinciden
 * en la forma exacta, así que se aceptan las dos, siempre https y SÓLO en `chatgpt.com`
 * (sin subdominios, sin usuario, sin puerto, sin query ni fragmento):
 * - fija: https://chatgpt.com/connector_platform_oauth_redirect
 * - por app: https://chatgpt.com/connector/oauth/<callback_id>, con un único segmento de
 *   [A-Za-z0-9_-] después de /connector/oauth/
 *
 * Copiado de propelia-frontend. Sumar un cliente nuevo = sumarlo acá, y revisar qué le promete el texto de esta pantalla.
 */

/** Cómo se llama la app a la que vuelve el código, para que la pantalla lo diga por su nombre. */
export type TrustedClient = 'Claude' | 'Claude Code' | 'ChatGPT'

export type RedirectTrust =
  /** Vuelve a un cliente conocido: se puede aprobar. */
  | { level: 'trusted'; client: 'Claude' | 'ChatGPT' }
  /** Vuelve a un programa local (Claude Code): se puede aprobar, con aviso. */
  | { level: 'loopback'; client: 'Claude Code' }
  /** Cualquier otra cosa: sólo se puede cancelar. */
  | { level: 'blocked'; client: null }

const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'

const CHATGPT_HOST = 'chatgpt.com'
const CHATGPT_FIXED_PATH = '/connector_platform_oauth_redirect'
const CHATGPT_PER_APP_PATH = /^\/connector\/oauth\/[A-Za-z0-9_-]+$/

export function redirectTrust(uri: string): RedirectTrust {
  if (uri === CLAUDE_CALLBACK) return { level: 'trusted', client: 'Claude' }
  try {
    const url = new URL(uri)
    if (isChatGptCallback(uri, url)) return { level: 'trusted', client: 'ChatGPT' }
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'http:' && loopback && url.pathname === '/callback' && !url.username && !url.password) {
      return { level: 'loopback', client: 'Claude Code' }
    }
  } catch {
    // URI inválida: se bloquea abajo.
  }
  return { level: 'blocked', client: null }
}

function isChatGptCallback(uri: string, url: URL): boolean {
  // `url.port` queda vacío para el 443 implícito y con valor para cualquier otro (`:8443`).
  if (url.protocol !== 'https:' || url.hostname !== CHATGPT_HOST || url.port !== '') return false
  // La URI tiene que ser literalmente origen + path: eso descarta usuario (`user@`), query,
  // fragmento y cualquier forma que el parser haya tenido que normalizar (`:443`, `..`, mayúsculas).
  if (url.origin + url.pathname !== uri) return false
  return url.pathname === CHATGPT_FIXED_PATH || CHATGPT_PER_APP_PATH.test(url.pathname)
}
