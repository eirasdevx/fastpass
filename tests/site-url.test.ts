import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ headers: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: mocks.headers }))
const { siteUrl } = await import('@/lib/site-url')

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
  mocks.headers.mockResolvedValue(new Headers({ host: 'fastpass.example', 'x-forwarded-host': 'attacker.example' }))
})
afterEach(() => { vi.unstubAllEnvs() })

describe('origen de los enlaces de autenticación', () => {
  it('no confía en Host ni X-Forwarded-Host en producción', async () => {
    await expect(siteUrl()).rejects.toThrow('NEXT_PUBLIC_SITE_URL')
  })
  it('utiliza exclusivamente el origen configurado', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://fastpass.example/')
    expect(await siteUrl()).toBe('https://fastpass.example')
  })
  it.each(['javascript:alert(1)', 'https://user:pass@fastpass.example', 'https://fastpass.example/path', 'https://fastpass.example?x=1', 'http://fastpass.example'])('rechaza configuración insegura: %s', async (url) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', url)
    await expect(siteUrl()).rejects.toThrow('NEXT_PUBLIC_SITE_URL')
  })
  it('en desarrollo permite localhost sin confiar en la cabecera reenviada', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    mocks.headers.mockResolvedValue(new Headers({ host: 'localhost:3100', 'x-forwarded-host': 'attacker.example' }))
    expect(await siteUrl()).toBe('http://localhost:3100')
  })
  it('un host externo en desarrollo necesita configuración explícita', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await expect(siteUrl()).rejects.toThrow('NEXT_PUBLIC_SITE_URL')
  })
})
