import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStaff: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), probeSignIn: vi.fn(), probeSignOut: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getStaff: mocks.getStaff }))
vi.mock('@/lib/site-url', () => ({ siteUrl: async () => 'https://fastpass.example' }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { updateUser: mocks.updateUser, signOut: mocks.signOut } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: mocks.probeSignIn, signOut: mocks.probeSignOut } }) }))
const { changePassword, updateEmail, updateName } = await import('@/app/admin/cuenta/actions')
const { eventSchema } = await import('@/lib/validations/event')

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getStaff.mockResolvedValue({ id: 'u1', email: 'ana@example.invalid', role: 'organizer' })
  mocks.updateUser.mockResolvedValue({ error: null })
  mocks.probeSignIn.mockResolvedValue({ error: null })
})

describe('perfil propio', () => {
  it('cambia el nombre en los metadatos de la cuenta', async () => {
    expect(await updateName(undefined, form({ first_name: ' Ana ', last_name: 'Pérez' }))).toEqual({ success: 'Nombre actualizado.' })
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { first_name: 'Ana', last_name: 'Pérez' } })
  })
  it('no cambia la contraseña si la actual es incorrecta', async () => {
    mocks.probeSignIn.mockResolvedValue({ error: { code: 'invalid_credentials' } })
    const r = await changePassword(undefined, form({ current_password: 'mala', password: 'nueva-larga', password_confirm: 'nueva-larga' }))
    expect(r?.fields?.current_password).toBe('Contraseña incorrecta')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('cambia la contraseña y cierra las demás sesiones, no la actual', async () => {
    const r = await changePassword(undefined, form({ current_password: 'vieja', password: 'nueva-larga', password_confirm: 'nueva-larga' }))
    expect(r?.success).toBeDefined()
    expect(mocks.probeSignIn).toHaveBeenCalledWith({ email: 'ana@example.invalid', password: 'vieja' })
    expect(mocks.probeSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'nueva-larga' })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
  it('pide confirmar el correo nuevo con un enlace', async () => {
    expect((await updateEmail(undefined, form({ email: 'ANA@example.invalid', current_password: 'x' })))?.fields?.email).toBeDefined()
    const r = await updateEmail(undefined, form({ email: 'Nueva@Example.invalid', current_password: 'vieja' }))
    expect(r?.success).toContain('nueva@example.invalid')
    expect(mocks.updateUser).toHaveBeenCalledWith({ email: 'nueva@example.invalid' }, { emailRedirectTo: 'https://fastpass.example/auth/confirm?next=/login/mfa' })
  })
})

describe('ubicación del evento', () => {
  const base = { title: 'Cotillón', description: '', venue: '', starts_at: '2026-12-31T22:00', ends_at: '', cover_url: '', published: false }
  it('acepta las dos coordenadas o ninguna', () => {
    expect(eventSchema.safeParse({ ...base, latitude: 41.31, longitude: -4.91 }).success).toBe(true)
    expect(eventSchema.safeParse({ ...base, latitude: null, longitude: null }).success).toBe(true)
    expect(eventSchema.safeParse({ ...base, latitude: 41.31, longitude: null }).success).toBe(false)
    expect(eventSchema.safeParse({ ...base, latitude: 91, longitude: 0 }).success).toBe(false)
  })
})
