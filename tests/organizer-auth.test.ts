import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`REDIRECT ${path}`) }),
  signUp: vi.fn(), resetPasswordForEmail: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challengeAndVerify: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/site-url', () => ({ siteUrl: async () => 'https://fastpass.example' }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
const { signup } = await import('@/app/(public)/login/crear-cuenta/actions')
const { requestPasswordReset } = await import('@/app/(public)/login/recuperar/actions')
const { updatePassword } = await import('@/app/(public)/login/nueva-contrasena/actions')

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const valid = {
  email: 'org@example.invalid', first_name: 'Ana', last_name: 'Pérez Gil',
  organization: 'Peña El Toro', password: 'contraseña-larga', password_confirm: 'contraseña-larga',
}

beforeEach(() => {
  vi.clearAllMocks()
  const { signUp, resetPasswordForEmail, getUser, updateUser, signOut } = mocks
  const { getAuthenticatorAssuranceLevel, listFactors, challengeAndVerify } = mocks
  mocks.createClient.mockResolvedValue({ auth: {
    signUp, resetPasswordForEmail, getUser, updateUser, signOut,
    mfa: { getAuthenticatorAssuranceLevel, listFactors, challengeAndVerify },
  } })
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null })
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null })
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
  mocks.updateUser.mockResolvedValue({ error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

describe('alta de organizadores', () => {
  it('envía nombre, apellidos y grupo como metadatos y pide confirmar el correo', async () => {
    expect(await signup(undefined, form(valid))).toEqual({ sent: true })
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: valid.email, password: valid.password,
      options: {
        emailRedirectTo: 'https://fastpass.example/auth/confirm?next=/login/mfa',
        data: { first_name: 'Ana', last_name: 'Pérez Gil', organization_name: 'Peña El Toro' },
      },
    })
  })
  it('contraseñas distintas o campos vacíos no llegan a Supabase y conservan lo escrito', async () => {
    const result = await signup(undefined, form({ ...valid, organization: ' ', password_confirm: 'otra-distinta' }))
    expect(result?.fields).toMatchObject({ organization: expect.any(String), password_confirm: 'Las contraseñas no coinciden' })
    expect(result?.values).toEqual({ email: valid.email, first_name: 'Ana', last_name: 'Pérez Gil', organization: ' ' })
    expect(JSON.stringify(result)).not.toContain(valid.password)
    expect(mocks.signUp).not.toHaveBeenCalled()
  })
  it('un correo ya registrado responde igual que uno nuevo', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { code: 'user_already_exists', message: 'User already registered' } })
    expect(await signup(undefined, form(valid))).toEqual({ sent: true })
  })
  it('no reenvía el texto del proveedor', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { code: 'unexpected', message: 'detalle interno' } })
    expect((await signup(undefined, form(valid)))?.error).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
  })
})

describe('restablecer contraseña', () => {
  it('responde igual exista o no la cuenta', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { code: 'user_not_found' } })
    expect(await requestPasswordReset(undefined, form({ email: valid.email }))).toEqual({ sent: true })
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(valid.email, {
      redirectTo: 'https://fastpass.example/auth/confirm?next=/login/nueva-contrasena',
    })
  })
  it('guarda la nueva contraseña y cierra todas las sesiones', async () => {
    await expect(updatePassword(undefined, form({ password: 'nueva-clave-1', password_confirm: 'nueva-clave-1' })))
      .rejects.toThrow('REDIRECT /login?aviso=contrasena')
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'nueva-clave-1' })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })
  it('sin sesión del enlace no cambia nada', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await updatePassword(undefined, form({ password: 'nueva-clave-1', password_confirm: 'nueva-clave-1' })))?.error)
      .toMatch(/caducado/)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('con MFA activado exige un código correcto antes de cambiarla', async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] } })
    mocks.challengeAndVerify.mockResolvedValue({ error: { code: 'mfa_verification_failed' } })
    const pair = { password: 'nueva-clave-1', password_confirm: 'nueva-clave-1' }
    expect((await updatePassword(undefined, form(pair)))?.fields?.code).toBeDefined()
    expect((await updatePassword(undefined, form({ ...pair, code: '123456' })))?.fields?.code).toMatch(/incorrecto/)
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})
