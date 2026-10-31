import { describe, expect, it } from 'vitest'
import { redirectTrust } from '@/lib/oauthRedirectTrust'

describe('redirectTrust', () => {
  it('Claude web/Desktop/mobile: aprobable', () => {
    expect(redirectTrust('https://claude.ai/api/mcp/auth_callback')).toEqual({ level: 'trusted', client: 'Claude' })
  })

  it('Claude Code (loopback en cualquier puerto): aprobable con aviso', () => {
    expect(redirectTrust('http://localhost:3118/callback')).toEqual({ level: 'loopback', client: 'Claude Code' })
    expect(redirectTrust('http://127.0.0.1:51234/callback')).toEqual({ level: 'loopback', client: 'Claude Code' })
  })

  it('ChatGPT: callback fijo y callback por app', () => {
    expect(redirectTrust('https://chatgpt.com/connector_platform_oauth_redirect')).toEqual({
      level: 'trusted',
      client: 'ChatGPT',
    })
    for (const ok of [
      'https://chatgpt.com/connector/oauth/abc123',
      'https://chatgpt.com/connector/oauth/g-ABC_def-123',
      'https://chatgpt.com/connector/oauth/_',
    ]) {
      expect(redirectTrust(ok), ok).toEqual({ level: 'trusted', client: 'ChatGPT' })
    }
  })

  it('ChatGPT: cualquier variación del host, esquema, puerto, usuario, path, query o fragmento se bloquea', () => {
    for (const evil of [
      // host
      'https://chatgpt.com.evil.com/connector_platform_oauth_redirect',
      'https://chatgpt.com.evil.com/connector/oauth/x',
      'https://evil.com/connector/oauth/x',
      'https://evil.com/connector_platform_oauth_redirect',
      'https://sub.chatgpt.com/connector/oauth/x',
      'https://sub.chatgpt.com/connector_platform_oauth_redirect',
      'https://chatgpt.co/connector/oauth/x',
      'https://xchatgpt.com/connector/oauth/x',
      // esquema
      'http://chatgpt.com/connector_platform_oauth_redirect',
      'http://chatgpt.com/connector/oauth/x',
      // puerto
      'https://chatgpt.com:8443/connector_platform_oauth_redirect',
      'https://chatgpt.com:8443/connector/oauth/x',
      // usuario
      'https://user@chatgpt.com/connector_platform_oauth_redirect',
      'https://user:pass@chatgpt.com/connector/oauth/x',
      'https://chatgpt.com@evil.com/connector/oauth/x',
      // path
      'https://chatgpt.com/connector/oauth/x/y',
      'https://chatgpt.com/connector/oauth/x/',
      'https://chatgpt.com/connector/oauth/',
      'https://chatgpt.com/connector/oauth',
      'https://chatgpt.com/connector_platform_oauth_redirect/',
      'https://chatgpt.com/connector_platform_oauth_redirect/extra',
      'https://chatgpt.com/connector/oauth/a.b',
      'https://chatgpt.com/connector/oauth/%41',
      'https://chatgpt.com/connector/oauth/x/../y',
      'https://chatgpt.com/otra-ruta',
      'https://chatgpt.com/',
      // query y fragmento
      'https://chatgpt.com/connector_platform_oauth_redirect?x=1',
      'https://chatgpt.com/connector_platform_oauth_redirect?',
      'https://chatgpt.com/connector/oauth/x?redirect=https://evil.com',
      'https://chatgpt.com/connector/oauth/x#frag',
    ]) {
      expect(redirectTrust(evil), evil).toEqual({ level: 'blocked', client: null })
    }
  })

  it('cualquier otra vuelta se bloquea, aunque se parezca a Claude', () => {
    for (const evil of [
      'https://evil.com/callback',
      'https://claude.ai.evil.com/api/mcp/auth_callback',
      'https://claude.ai/api/mcp/auth_callback/../../evil',
      'https://claude.ai/otra-ruta',
      'http://claude.ai/api/mcp/auth_callback',
      'https://localhost/callback',
      'http://localhost:3000/otra',
      'http://user:pass@localhost:3000/callback',
      'no-es-una-url',
      '',
    ]) {
      expect(redirectTrust(evil), evil).toEqual({ level: 'blocked', client: null })
    }
  })
})
