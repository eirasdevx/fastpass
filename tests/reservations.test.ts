import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { testDatabase } from './helpers/postgres'

let db: Awaited<ReturnType<typeof testDatabase>>
type Fixture = { org: string; organizer: string; controller: string; event: string; type: string }
let f: Fixture
const connections: Client[] = []

async function as(user = '') {
  const connection = await db.connect(user)
  connections.push(connection)
  return connection
}
async function fixture(options: { capacity?: number | null; typeCapacity?: number | null; other?: number; maxPerPerson?: number | null } = {}): Promise<Fixture> {
  const x = Object.fromEntries(['org','organizer','controller','event','type'].map((key) => [key, randomUUID()])) as Fixture
  await db.owner.query('insert into auth.users(id) values($1),($2)', [x.organizer, x.controller])
  await db.owner.query("insert into organizations values($1,'Cuadrilla')", [x.org])
  await db.owner.query("insert into organization_members values($1,$2,'organizer'),($3,$2,'controller')", [x.organizer, x.org, x.controller])
  await db.owner.query(`insert into events(id,slug,title,starts_at,published,status,organization_id,capacity,registration_enabled,registration_mode,
      privacy_controller,privacy_contact,pickup_deadline,pickup_address,max_per_person,reserved_other_channels)
    values($1::uuid,$1::text,'Cotillón',now()+interval '30 days',true,'published',$2,$3,true,'pickup','Cuadrilla','privacidad@example.invalid',
      now()+interval '20 days','Boulevard Café',$4,$5)`,
    [x.event, x.org, options.capacity === undefined ? 10 : options.capacity, options.maxPerPerson === undefined ? 5 : options.maxPerPerson, options.other ?? 2])
  await db.owner.query("insert into ticket_types(id,event_id,name,price,capacity,max_per_order) values($1,$2,'Bonocopas',15,$3,4)",
    [x.type, x.event, options.typeCapacity === undefined ? 6 : options.typeCapacity])
  await db.owner.query('insert into event_staff values($1,$2)', [x.event, x.controller])
  return x
}
async function reserve(client: Client, quantity = 1, email = `${randomUUID()}@example.invalid`, extra: { manual?: boolean; consent?: boolean; x?: Fixture } = {}) {
  const x = extra.x ?? f
  const { rows } = await client.query('select reserve_bonocopas($1,$2,$3,$4,$5,$6,$7,$8,$9) r',
    [x.event, x.type, quantity, 'Ana', 'Pérez', email, '', extra.consent ?? !extra.manual, extra.manual ?? false])
  return rows[0].r as { token?: string; code?: string; error?: string }
}
async function pickup(client: Client, credential: string, quantity: number, identity = false, x = f) {
  const { rows } = await client.query('select record_pickup($1,$2,$3,$4,$5,$6) r', [x.event, credential, quantity, 'cash', true, identity])
  return rows[0].r as { error?: string; amount?: number; reservation?: { status: string; pending_quantity: number; amount_paid: number } }
}
const units = async (x = f) => Number((await db.owner.query('select private.reserved_units($1,null) n', [x.event])).rows[0].n)

beforeAll(async () => { db = await testDatabase() }, 60000)
afterAll(async () => { if (db) await db.stop() }, 30000)
beforeEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.end()))
  f = await fixture()
})

describe('reserva pública de bonocopas', () => {
  it('devuelve token largo y código de 4 caracteres; solo se guarda la huella del token', async () => {
    const result = await reserve(await as(), 3)
    expect(result.token).toMatch(/^[a-f0-9]{64}$/)
    expect(result.code).toMatch(/^[2-9A-HJ-NP-Z]{4}$/)
    const stored = (await db.owner.query('select token_hash, unit_price, status from reservations where event_id=$1', [f.event])).rows[0]
    expect(stored.token_hash).not.toBe(result.token)
    expect(stored).toMatchObject({ unit_price: '15.00', status: 'pending_pickup' })
    const summary = (await (await as()).query('select get_reservation($1) s', [result.token])).rows[0].s
    expect(summary).toMatchObject({ code: result.code, quantity: 3, total: 45, amount_pending: 45, status: 'pending_pickup', pickup_address: 'Boulevard Café', item_name: 'bonocopas' })
    expect(JSON.stringify(summary)).not.toContain('@example.invalid')
  })
  it('valida privacidad, ventana de reservas, modalidad y límites', async () => {
    const anon = await as()
    expect((await reserve(anon, 1, undefined, { consent: false })).error).toBe('INVALID_INPUT')
    expect((await reserve(anon, 5)).error).toBe('ORDER_LIMIT')
    const email = 'repite@example.invalid'
    expect((await reserve(anon, 4, email)).token).toBeDefined()
    expect((await reserve(anon, 2, email)).error).toBe('PERSON_LIMIT')
    await db.owner.query("update events set reservations_open_at=now()+interval '1 day' where id=$1", [f.event])
    expect((await reserve(anon)).error).toBe('RESERVATIONS_NOT_OPEN')
    await db.owner.query("update events set reservations_open_at=null, reservations_close_at=now()-interval '1 minute' where id=$1", [f.event])
    expect((await reserve(anon)).error).toBe('RESERVATIONS_CLOSED')
    await db.owner.query("update events set reservations_close_at=null, registration_mode='manual' where id=$1", [f.event])
    expect((await reserve(anon)).error).toBe('EVENT_UNAVAILABLE')
  })
  it('el formulario de inscripción normal no admite eventos de recogida', async () => {
    const { rows } = await (await as()).query("select register_attendee($1,$2,'Ana','Pérez','ana@example.invalid','',true) r", [f.event, f.type])
    expect(rows[0].r.error).toBe('EVENT_UNAVAILABLE')
  })
  it('cupo por tipo y aforo con otros canales nunca se superan', async () => {
    const anon = await as()
    expect((await reserve(anon, 4)).token).toBeDefined()
    expect((await reserve(anon, 3)).error).toBe('SOLD_OUT') // tipo: 6
    expect((await reserve(anon, 2)).token).toBeDefined()
    const g = await fixture({ capacity: 5, typeCapacity: null, other: 2 })
    expect((await reserve(anon, 3, undefined, { x: g })).token).toBeDefined()
    expect((await reserve(anon, 1, undefined, { x: g })).error).toBe('SOLD_OUT') // 3 + 2 otros canales = 5
    await expect(db.owner.query('update events set capacity=4 where id=$1', [g.event])).rejects.toThrow('CAPACITY_BELOW_SOLD')
    await expect(db.owner.query('update events set reserved_other_channels=3 where id=$1', [g.event])).rejects.toThrow('CAPACITY_BELOW_SOLD')
  })
  it('reservas simultáneas: el cupo se descuenta de forma atómica', async () => {
    const clients = await Promise.all(Array.from({ length: 12 }, () => as()))
    const results = await Promise.all(clients.map((client) => reserve(client, 1)))
    expect(results.filter((r) => r.token)).toHaveLength(6)
    expect(results.filter((r) => r.error === 'SOLD_OUT')).toHaveLength(6)
    expect(await units()).toBe(6)
  })
  it('códigos únicos dentro del evento, también ante una inserción duplicada', async () => {
    const g = await fixture({ capacity: null, typeCapacity: null, maxPerPerson: null })
    const organizer = await as(g.organizer)
    const codes = new Set<string>()
    for (let i = 0; i < 150; i++) codes.add((await reserve(organizer, 1, undefined, { manual: true, x: g })).code!)
    expect(codes.size).toBe(150)
    const existing = [...codes][0]
    await expect(db.owner.query(`insert into reservations(event_id,ticket_type_id,code,token_hash,first_name,last_name,email,quantity,unit_price,source)
      values($1,$2,$3,repeat('a',64),'X','Y','x@example.invalid',1,0,'manual')`, [g.event, g.type, existing])).rejects.toThrow(/duplicate key/)
  })
})

describe('recogida presencial', () => {
  it('entregas parciales registran cantidad, importe, método y administrador', async () => {
    const { token } = await reserve(await as(), 3)
    const controller = await as(f.controller)
    const first = await pickup(controller, token!, 2)
    expect(first).toMatchObject({ amount: 30, reservation: { status: 'partially_picked_up', pending_quantity: 1, amount_paid: 30 } })
    expect((await pickup(controller, token!, 2)).error).toBe('QUANTITY_EXCEEDED')
    expect((await pickup(controller, `https://fastpass.example/reserva/${token}`, 1)).reservation?.status).toBe('completed')
    expect((await pickup(controller, token!, 1)).error).toBe('ALREADY_COMPLETED')
    const rows = (await db.owner.query('select quantity, amount, payment_method, admin_id from reservation_pickups where event_id=$1 order by id', [f.event])).rows
    expect(rows).toEqual([
      { quantity: 2, amount: '30.00', payment_method: 'cash', admin_id: f.controller },
      { quantity: 1, amount: '15.00', payment_method: 'cash', admin_id: f.controller },
    ])
  })
  it('doble recogida simultánea: solo una entrega se registra', async () => {
    const { token } = await reserve(await as(), 3)
    const [a, b] = await Promise.all([as(f.controller), as(f.organizer)])
    const results = await Promise.all([pickup(a, token!, 3), pickup(b, token!, 3)])
    expect(results.filter((r) => r.reservation)).toHaveLength(1)
    expect(results.filter((r) => r.error === 'ALREADY_COMPLETED')).toHaveLength(1)
    expect((await db.owner.query('select count(*)::int n from reservation_pickups where event_id=$1', [f.event])).rows[0].n).toBe(1)
  })
  it('con el código de 4 caracteres exige comprobar la identidad y confirmar el pago', async () => {
    const { code } = await reserve(await as(), 1)
    const controller = await as(f.controller)
    expect((await pickup(controller, code!.toLowerCase(), 1)).error).toBe('IDENTITY_CHECK_REQUIRED')
    const unpaid = (await controller.query('select record_pickup($1,$2,1,$3,false,true) r', [f.event, code, 'cash'])).rows[0].r
    expect(unpaid.error).toBe('PAYMENT_NOT_CONFIRMED')
    expect((await pickup(controller, code!, 1, true)).reservation?.status).toBe('completed')
  })
  it('solo el personal del evento consulta o entrega; el público no lee reservas', async () => {
    const { token } = await reserve(await as(), 1)
    const other = await fixture()
    expect((await (await as(other.controller)).query('select lookup_reservation($1,$2) r', [f.event, token])).rows[0].r.error).toBe('FORBIDDEN')
    expect((await pickup(await as(other.organizer), token!, 1)).error).toBe('FORBIDDEN')
    // Credencial de otro evento: no se encuentra aunque el token sea válido.
    expect((await pickup(await as(other.controller), token!, 1, false, other)).error).toBe('NOT_FOUND')
    const anon = await as()
    await expect(anon.query('select lookup_reservation($1,$2)', [f.event, token])).rejects.toThrow(/permission denied/)
    await expect(anon.query('select * from reservations')).rejects.toThrow(/permission denied/)
    expect((await (await as(f.organizer)).query('select * from reservations')).rowCount).toBe(1)
  })
})

describe('caducidad y cancelación', () => {
  it('al pasar la fecha límite caduca y libera solo lo no entregado', async () => {
    const { token } = await reserve(await as(), 3)
    await pickup(await as(f.controller), token!, 1)
    expect(await units()).toBe(3)
    await db.owner.query("update events set pickup_deadline=now()-interval '1 minute' where id=$1", [f.event])
    expect(await units()).toBe(1)
    expect((await (await as()).query('select get_reservation($1) s', [token])).rows[0].s).toMatchObject({ status: 'expired', amount_pending: 0 })
    expect((await pickup(await as(f.controller), token!, 1)).error).toBe('RESERVATION_EXPIRED')
    expect((await db.owner.query('select status from reservations where event_id=$1', [f.event])).rows[0].status).toBe('expired')
    expect((await reserve(await as())).error).toBe('EVENT_UNAVAILABLE')
  })
  it('cancelar libera el cupo pendiente; solo la organización puede hacerlo', async () => {
    const { token } = await reserve(await as(), 4)
    const id = (await db.owner.query('select id from reservations where event_id=$1', [f.event])).rows[0].id
    await pickup(await as(f.controller), token!, 1)
    expect((await (await as(f.controller)).query('select cancel_reservation($1) r', [id])).rows[0].r.error).toBe('FORBIDDEN')
    expect((await (await as(f.organizer)).query('select cancel_reservation($1) r', [id])).rows[0].r.reservation.status).toBe('cancelled')
    expect(await units()).toBe(1)
    expect((await reserve(await as(), 4)).token).toBeDefined() // 6 - 1 entregado
    const stats = (await (await as(f.organizer)).query('select reservation_stats($1) s', [f.event])).rows[0].s
    expect(stats).toMatchObject({ capacity: 10, other_channels: 2, delivered: 1, reserved_pending: 4, reservations_cancelled: 1, committed: 7 })
  })
})

describe('panel de reservas', () => {
  it('lista con búsqueda por nombre, correo y código y filtros de estado', async () => {
    const anon = await as()
    const first = await reserve(anon, 1, 'lucia@example.invalid')
    await reserve(anon, 2, 'hugo@example.invalid')
    const organizer = await as(f.organizer)
    const list = async (q = '', status = '') => (await organizer.query('select list_reservations($1,$2,$3) r', [f.event, q, status])).rows[0].r
    expect((await list()).total).toBe(2)
    expect((await list('LUCIA@')).rows.map((r: { email: string }) => r.email)).toEqual(['lucia@example.invalid'])
    expect((await list(first.code!.toLowerCase())).total).toBe(1)
    expect((await list('', 'completed')).total).toBe(0)
    await expect(organizer.query("select list_reservations($1,'','pagado')", [f.event])).rejects.toThrow('INVALID_INPUT')
    await expect((await as(f.controller)).query('select list_reservations($1)', [f.event])).rejects.toThrow('FORBIDDEN')
  })
  it('detalle con historial de entregas y nuevo enlace que invalida el anterior', async () => {
    const { token } = await reserve(await as(), 2)
    await db.owner.query("update auth.users set email='puerta@example.invalid' where id=$1", [f.controller])
    await pickup(await as(f.controller), token!, 1)
    const organizer = await as(f.organizer)
    const id = (await db.owner.query('select id from reservations where event_id=$1', [f.event])).rows[0].id
    const detail = (await organizer.query('select reservation_detail($1) d', [id])).rows[0].d
    expect(detail).toMatchObject({ email: expect.stringContaining('@'), pending_quantity: 1, pickups: [{ quantity: 1, amount: 15, admin_email: 'puerta@example.invalid' }] })
    const fresh = (await organizer.query('select rotate_reservation_link($1) t', [id])).rows[0].t
    const anon = await as()
    expect((await anon.query('select get_reservation($1) s', [token])).rows[0].s).toBeNull()
    expect((await anon.query('select get_reservation($1) s', [fresh])).rows[0].s.code).toBe(detail.code)
    await expect((await as(f.controller)).query('select rotate_reservation_link($1)', [id])).rejects.toThrow('FORBIDDEN')
  })
})

describe('datos de cada persona (DNI, fecha de nacimiento y edad mínima)', () => {
  const person = (first: string, document_id: string, birth_date = '1990-05-10') => ({ first_name: first, last_name: 'Pérez', document_id, birth_date })
  async function reservePeople(people: unknown[], quantity = people.length, email = `${randomUUID()}@example.invalid`) {
    const { rows } = await (await as()).query('select reserve_bonocopas($1,$2,$3,$4,$5,$6,$7,true,false,$8,$9::jsonb) r',
      [f.event, f.type, quantity, 'Ana', 'Pérez', email, '', '', JSON.stringify(people)])
    return rows[0].r as { token?: string; error?: string }
  }
  beforeEach(async () => {
    await db.owner.query('update events set require_document=true, require_birth_date=true, min_age=18 where id=$1', [f.event])
  })
  it('guarda una persona por plaza, con el DNI normalizado, y el justificante lo enmascara', async () => {
    const result = await reservePeople([person('Ana', '12345678-z'), person('Luis', 'x1234567l')])
    expect(result.token).toBeDefined()
    const stored = (await db.owner.query('select position, first_name, document_id, birth_date::text from reservation_attendees where event_id=$1 order by position', [f.event])).rows
    expect(stored).toEqual([
      { position: 1, first_name: 'Ana', document_id: '12345678Z', birth_date: '1990-05-10' },
      { position: 2, first_name: 'Luis', document_id: 'X1234567L', birth_date: '1990-05-10' },
    ])
    const summary = (await (await as()).query('select get_reservation($1) s', [result.token])).rows[0].s
    expect(summary.people).toEqual([{ name: 'Ana Pérez', document: '•••••678Z' }, { name: 'Luis Pérez', document: '•••••567L' }])
    expect(JSON.stringify(summary)).not.toContain('1990-05-10')
  })
  it('rechaza falta de datos, letra de control errónea, menores y documentos repetidos', async () => {
    expect((await reservePeople([person('Ana', '12345678Z')], 2)).error).toBe('ATTENDEES_REQUIRED')
    expect((await reservePeople([person('Ana', '12345678A')])).error).toBe('INVALID_DOCUMENT')
    expect((await reservePeople([person('Ana', '12345678Z', '2015-01-01')])).error).toBe('AGE_RESTRICTED')
    expect((await reservePeople([person('Ana', '12345678Z'), person('Luis', '12345678Z')])).error).toBe('DUPLICATE_DOCUMENT')
    expect((await reservePeople([person('Ana', '12345678Z')])).token).toBeDefined()
    expect((await reservePeople([person('Otra', '12345678Z')])).error).toBe('DUPLICATE_DOCUMENT')
    expect((await reservePeople([{ ...person('Ana', 'X1234567L'), birth_date: '2099-01-01' }])).error).toBe('INVALID_BIRTH_DATE')
  })
  it('el panel busca por DNI de cualquier persona y el detalle muestra todos sus datos', async () => {
    await reservePeople([person('Ana', '12345678Z'), person('Luis', 'X1234567L')])
    const organizer = await as(f.organizer)
    const list = (await organizer.query("select list_reservations($1,'x1234567l') r", [f.event])).rows[0].r
    expect(list.total).toBe(1)
    const detail = (await organizer.query('select reservation_detail($1) d', [list.rows[0].id])).rows[0].d
    expect(detail.attendees[1]).toEqual({ position: 2, first_name: 'Luis', last_name: 'Pérez', document_id: 'X1234567L', birth_date: '1990-05-10' })
    await expect((await as()).query('select * from reservation_attendees')).rejects.toThrow(/permission denied/)
  })
})

describe('borrado de datos personales (RGPD)', () => {
  const people = JSON.stringify([{ first_name: 'Ana', last_name: 'Pérez', document_id: '12345678Z', birth_date: '1990-05-10' }])
  async function reserveWithPerson() {
    await db.owner.query('update events set require_document=true where id=$1', [f.event])
    const { rows } = await (await as()).query("select reserve_bonocopas($1,$2,1,'Ana','Pérez','ana@example.invalid','600111222',true,false,'',$3::jsonb) r", [f.event, f.type, people])
    return rows[0].r as { token: string }
  }
  const stored = async () => (await db.owner.query('select first_name, last_name, email, phone, status, personal_data_removed_at from reservations where event_id=$1', [f.event])).rows[0]

  it('suprimir una reserva borra contacto, personas y enlace; anula lo pendiente y conserva importes', async () => {
    const { token } = await reserveWithPerson()
    await pickup(await as(f.controller), token, 1)
    const id = (await db.owner.query('select id from reservations where event_id=$1', [f.event])).rows[0].id
    expect((await (await as(f.controller)).query('select redact_reservation($1) r', [id])).rows[0].r.error).toBe('FORBIDDEN')
    const organizer = await as(f.organizer)
    expect((await organizer.query('select redact_reservation($1) r', [id])).rows[0].r).toEqual({ success: true })
    expect(await stored()).toMatchObject({ first_name: 'Datos suprimidos', last_name: '', email: `${id}@deleted.invalid`, phone: '', status: 'completed' })
    expect((await db.owner.query('select count(*)::int n from reservation_attendees where event_id=$1', [f.event])).rows[0].n).toBe(0)
    expect((await (await as()).query('select get_reservation($1) s', [token])).rows[0].s).toBeNull()
    expect((await db.owner.query('select amount_paid, delivered_quantity from reservations where id=$1', [id])).rows[0]).toEqual({ amount_paid: '15.00', delivered_quantity: 1 })
    await expect(organizer.query('select rotate_reservation_link($1)', [id])).rejects.toThrow('INVALID_TRANSITION')
    // El mismo DNI puede volver a reservar: ya no queda constancia de él.
    expect((await reserveWithPerson()).token).toBeDefined()
  })
  it('una reserva pendiente suprimida queda anulada y libera el cupo', async () => {
    await reserveWithPerson()
    const id = (await db.owner.query('select id from reservations where event_id=$1', [f.event])).rows[0].id
    await (await as(f.organizer)).query('select redact_reservation($1)', [id])
    expect((await stored()).status).toBe('cancelled')
    expect(await units()).toBe(0)
  })
  it('el panel solo borra un evento terminado; la tarea diaria borra al cumplirse el plazo', async () => {
    await reserveWithPerson()
    const organizer = await as(f.organizer)
    expect((await organizer.query('select purge_event_personal_data($1) r', [f.event])).rows[0].r.error).toBe('EVENT_NOT_FINISHED')
    await db.owner.query("update events set starts_at=now()-interval '10 days', pickup_deadline=now()-interval '11 days', retention_days=30 where id=$1", [f.event])
    await db.owner.query('select private.purge_expired_personal_data()')
    expect((await stored()).personal_data_removed_at).toBeNull()
    await db.owner.query('update events set retention_days=5 where id=$1', [f.event])
    await db.owner.query('select private.purge_expired_personal_data()')
    expect(await stored()).toMatchObject({ first_name: 'Datos suprimidos', phone: '' })
    expect((await db.owner.query('select personal_data_purged_at from events where id=$1', [f.event])).rows[0].personal_data_purged_at).not.toBeNull()
    await expect((await as()).query('select private.purge_expired_personal_data()')).rejects.toThrow(/permission denied/)
  })
  it('borra también inscripciones y entradas del evento sin cambiar su estado', async () => {
    const other = await fixture()
    await db.owner.query("update events set registration_mode='automatic', starts_at=now()-interval '2 days', pickup_deadline=null where id=$1", [other.event])
    await db.owner.query('update ticket_types set price=0 where id=$1', [other.type])
    const attendee = randomUUID(), registration = randomUUID(), order = randomUUID()
    await db.owner.query("insert into attendees(id,event_id,first_name,last_name,email,phone) values($1,$2,'Luis','Gil','luis@example.invalid','600')", [attendee, other.event])
    await db.owner.query("insert into registrations(id,event_id,attendee_id,ticket_type_id,status,source,approved_at) values($1,$2,$3,$4,'approved','public',now())", [registration, other.event, attendee, other.type])
    await db.owner.query("insert into orders(id,event_id,buyer_name,buyer_email) values($1,$2,'Luis Gil','luis@example.invalid')", [order, other.event])
    await db.owner.query("insert into tickets(order_id,event_id,ticket_type_id,attendee_name,registration_id,status) values($1,$2,$3,'Luis Gil',$4,'used')", [order, other.event, other.type, registration])
    expect((await (await as(other.organizer)).query('select purge_event_personal_data($1) r', [other.event])).rows[0].r.purged_at).toBeDefined()
    expect((await db.owner.query('select first_name, email from attendees where id=$1', [attendee])).rows[0]).toEqual({ first_name: 'Datos suprimidos', email: `${attendee}@deleted.invalid` })
    expect((await db.owner.query('select buyer_name from orders where id=$1', [order])).rows[0].buyer_name).toBe('Datos suprimidos')
    expect((await db.owner.query('select attendee_name, status from tickets where order_id=$1', [order])).rows[0]).toEqual({ attendee_name: 'Datos suprimidos', status: 'used' })
  })
})

describe('asistentes de un evento con reserva', () => {
  it('solo quien ya ha recogido: una fila por persona o el titular con las plazas entregadas', async () => {
    const people = JSON.stringify([{ first_name: 'Ana', last_name: 'Pérez' }, { first_name: 'Luis', last_name: 'Gil' }])
    await db.owner.query('update events set attendee_details=true where id=$1', [f.event])
    await (await as()).query("select reserve_bonocopas($1,$2,2,'Ana','Pérez','ana@example.invalid','',true,false,'',$3::jsonb)", [f.event, f.type, people])
    await db.owner.query('update events set attendee_details=false where id=$1', [f.event])
    const partial = await reserve(await as(), 3, 'eva@example.invalid')
    await reserve(await as(), 1, 'pendiente@example.invalid')
    const organizer = await as(f.organizer)
    const list = async () => (await organizer.query('select list_reservation_people($1) r', [f.event])).rows[0].r
    expect(await list()).toMatchObject({ total: 0, places: 0 })
    const first = (await db.owner.query("select id from reservations where event_id=$1 and email='ana@example.invalid'", [f.event])).rows[0].id
    await db.owner.query('update reservations set delivered_quantity=2, amount_paid=30, status=$2 where id=$1', [first, 'completed'])
    await pickup(await as(f.controller), partial.token!, 2)
    const page = await list()
    expect(page).toMatchObject({ total: 3, places: 4 })
    expect(page.rows.map((r: { name: string; places: number; position: number; status: string }) => [r.name, r.places, r.position, r.status]))
      .toEqual([['Ana Pérez', 2, 1, 'partially_picked_up'], ['Ana Pérez', 1, 1, 'completed'], ['Luis Gil', 1, 2, 'completed']])
    expect((await organizer.query("select list_reservation_people($1,'luis') r", [f.event])).rows[0].r.total).toBe(1)
    await expect((await as(f.controller)).query('select list_reservation_people($1)', [f.event])).rejects.toThrow('FORBIDDEN')
  })
})

describe('aviso de escaneo repetido en Accesos', () => {
  it('el resumen trae la hora de la última entrega', async () => {
    const { token } = await reserve(await as(), 1)
    const controller = await as(f.controller)
    expect((await controller.query('select lookup_reservation($1,$2) r', [f.event, token])).rows[0].r.reservation.last_pickup_at).toBeNull()
    await pickup(controller, token!, 1)
    const again = (await controller.query('select lookup_reservation($1,$2) r', [f.event, token])).rows[0].r.reservation
    expect(again).toMatchObject({ status: 'completed', last_pickup_at: expect.any(String) })
  })
})
