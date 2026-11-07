import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn(), getStaff: vi.fn(), getAdmin: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth', () => ({ getStaff: mocks.getStaff, getAdmin: mocks.getAdmin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const { reserveBonocopas } = await import('@/app/(public)/eventos/[slug]/reservar/actions')
const { lookupReservation, recordPickup } = await import('@/app/admin/recogidas/actions')
const { createManualReservation } = await import('@/app/admin/reservas/actions')

const id = 'd5743e68-5c9a-41a8-ae8d-bfa9e60c2e6a'
const input = { event: id, type: id, quantity: 2, first: 'Ana', last: 'Pérez', email: 'Ana@Example.invalid', phone: '', consent: true, attendees: [], website: '' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
})

describe('acción pública de reserva', () => {
  it('normaliza el DNI de cada persona antes de enviarlo', async () => {
    mocks.rpc.mockResolvedValue({ data: { token: 'a'.repeat(64) }, error: null })
    const person = { first_name: 'Luis', last_name: 'Pérez', document_id: '12.345.678-z', birth_date: '1990-01-01' }
    await reserveBonocopas({ ...input, attendees: [person] })
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_with_pass', expect.objectContaining({ p_attendees: [{ ...person, document_id: '12345678Z' }] }))
  })
  it('envía los datos validados y devuelve el token', async () => {
    mocks.rpc.mockResolvedValue({ data: { token: 'a'.repeat(64), code: 'AB23' }, error: null })
    expect(await reserveBonocopas(input)).toEqual({ token: 'a'.repeat(64) })
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_with_pass', {
      p_pass: '', p_event: id, p_type: id, p_quantity: 2, p_first: 'Ana', p_last: 'Pérez',
      p_email: 'ana@example.invalid', p_phone: '', p_consent: true, p_attendees: [],
    })
  })
  it('sin la migración 0017 reserva como antes; con turno caducado avisa de volver a la cola', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
      .mockResolvedValueOnce({ data: { token: 'b'.repeat(64) }, error: null })
    expect(await reserveBonocopas(input)).toEqual({ token: 'b'.repeat(64) })
    expect(mocks.rpc).toHaveBeenLastCalledWith('reserve_bonocopas', expect.not.objectContaining({ p_pass: expect.anything() }))
    mocks.rpc.mockResolvedValue({ data: { error: 'QUEUE_REQUIRED' }, error: null })
    expect(await reserveBonocopas(input)).toMatchObject({ queue: true, error: expect.stringMatching(/sala de espera/) })
  })
  it('sin privacidad, con el campo trampa relleno o cantidad no válida no llega a la base de datos', async () => {
    expect((await reserveBonocopas({ ...input, consent: false })).error).toMatch(/privacidad/)
    expect((await reserveBonocopas({ ...input, website: 'http://spam' })).error).toBeDefined()
    expect((await reserveBonocopas({ ...input, quantity: 0 })).error).toBeDefined()
    const person = { first_name: 'Luis', last_name: 'Pérez', document_id: '12345678A', birth_date: '1990-01-01' }
    expect((await reserveBonocopas({ ...input, attendees: [person] })).error).toMatch(/Documento no válido/)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('traduce los errores conocidos y oculta el resto', async () => {
    mocks.rpc.mockResolvedValue({ data: { error: 'SOLD_OUT' }, error: null })
    expect((await reserveBonocopas(input)).error).toBe('No quedan suficientes entradas.')
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'detalle interno token=secret' } })
    expect((await reserveBonocopas(input)).error).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
  })
})

describe('punto de recogida y alta manual', () => {
  const token = 'ab'.repeat(32)
  const pickup = { event: id, credential: token, quantity: 1, method: 'cash' as const, paid: true, identity: false }
  it('sin sesión no consulta ni entrega', async () => {
    mocks.getStaff.mockResolvedValue(null)
    expect((await lookupReservation(id, 'K7P2')).error).toMatch(/sesión/)
    expect((await recordPickup(pickup)).error).toMatch(/sesión/)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('del QR (URL) envía solo el token; el código se normaliza; lo demás se rechaza', async () => {
    mocks.getStaff.mockResolvedValue({ id, role: 'controller' })
    mocks.rpc.mockResolvedValue({ data: { by_code: false, reservation: {} }, error: null })
    await lookupReservation(id, `https://fastpass.example/reserva/${token.toUpperCase()}?x=1`)
    expect(mocks.rpc).toHaveBeenLastCalledWith('lookup_reservation', { p_event: id, p_credential: token })
    await lookupReservation(id, ' k7-p2 ')
    expect(mocks.rpc).toHaveBeenLastCalledWith('lookup_reservation', { p_event: id, p_credential: 'K7P2' })
    expect((await lookupReservation(id, "K7P2' or 1=1")).error).toBeDefined()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })
  it('la entrega pasa cantidad, método y confirmaciones; los errores se traducen', async () => {
    mocks.getStaff.mockResolvedValue({ id, role: 'controller' })
    mocks.rpc.mockResolvedValue({ data: { error: 'ALREADY_COMPLETED' }, error: null })
    expect((await recordPickup(pickup)).error).toMatch(/ya se entregó/)
    expect(mocks.rpc).toHaveBeenCalledWith('record_pickup', {
      p_event: id, p_credential: token, p_quantity: 1, p_method: 'cash', p_payment_confirmed: true, p_identity_checked: false,
    })
    expect((await recordPickup({ ...pickup, method: 'paypal' as 'cash' })).error).toBe('Datos no válidos.')
  })
  it('la reserva manual exige organizador', async () => {
    mocks.getAdmin.mockResolvedValue(null)
    const manual = { event: id, type: id, quantity: 2, first: 'Ana', last: 'Pérez', email: 'ana@example.invalid', phone: '', notes: '', attendees: [] }
    expect((await createManualReservation(manual)).error).toBe('No autorizado.')
    mocks.getAdmin.mockResolvedValue({ id, role: 'organizer' })
    mocks.rpc.mockResolvedValue({ data: { token, code: 'K7P2' }, error: null })
    expect(await createManualReservation(manual)).toEqual({ token, code: 'K7P2' })
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_bonocopas', expect.objectContaining({ p_manual: true, p_consent: false, p_quantity: 2 }))
  })
})

describe('control de accesos con un justificante de reserva', async () => {
  const { checkEntry } = await import('@/app/admin/accesos/actions')
  const token = 'cd'.repeat(32)
  it('el código de una reserva no se toma por una entrada: avisa y no confirma acceso', async () => {
    mocks.getStaff.mockResolvedValue({ id, role: 'controller' })
    mocks.rpc.mockImplementation(async (name: string) => name === 'lookup_entry'
      ? { data: { result: 'not_found' }, error: null }
      : { data: { by_code: true, reservation: { code: 'B8X8', holder: 'Serafín Eiras', type_name: 'Bonocopas Cubatas' } }, error: null })
    expect((await checkEntry(id, 'b8x8')).data).toEqual({ result: 'reservation', code: 'B8X8', attendee_name: 'Serafín Eiras', type_name: 'Bonocopas Cubatas' })
    expect(mocks.rpc).toHaveBeenLastCalledWith('lookup_reservation', { p_event: id, p_credential: 'B8X8' })
  })
  it('el QR del justificante (URL) también se reconoce como reserva', async () => {
    mocks.getStaff.mockResolvedValue({ id, role: 'controller' })
    mocks.rpc.mockResolvedValue({ data: { by_code: false, reservation: { code: 'B8X8', holder: 'Serafín Eiras', type_name: 'Bonocopas' } }, error: null })
    expect((await checkEntry(id, `https://fastpass.example/reserva/${token}`)).data?.result).toBe('reservation')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('lookup_reservation', { p_event: id, p_credential: token })
  })
})
