import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { testDatabase } from './helpers/postgres'

let db: Awaited<ReturnType<typeof testDatabase>>
type Fixture = { org: string; organizer: string; controller: string; event: string; type: string }
let f: Fixture
const connections: Client[] = []

async function as(user = '', aal = 'aal2') {
  const connection = await db.connect(user, aal)
  connections.push(connection)
  return connection
}
async function fixture(): Promise<Fixture> {
  const x = Object.fromEntries(['org','organizer','controller','event','type'].map((key) => [key, randomUUID()])) as Fixture
  await db.owner.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$3,'{\"first_name\":\"Olga\",\"last_name\":\"Org\"}'),($2,$4,'{}')",
    [x.organizer, x.controller, `${x.organizer}@example.invalid`, `${x.controller}@example.invalid`])
  await db.owner.query("insert into organizations values($1,'Cuadrilla')", [x.org])
  await db.owner.query("insert into organization_members values($1,$2,'organizer'),($3,$2,'controller')", [x.organizer, x.org, x.controller])
  await db.owner.query(`insert into events(id,slug,title,starts_at,published,status,organization_id,capacity,registration_enabled,registration_mode,
      privacy_controller,privacy_contact,pickup_deadline)
    values($1::uuid,$1::text,'Cotillón',now()+interval '30 days',true,'published',$2,10,true,'pickup','Cuadrilla','privacidad@example.invalid',now()+interval '20 days')`,
    [x.event, x.org])
  await db.owner.query("insert into ticket_types(id,event_id,name,price,capacity,max_per_order) values($1,$2,'Bonocopas',15,6,4)", [x.type, x.event])
  await db.owner.query('insert into event_staff values($1,$2)', [x.event, x.controller])
  return x
}
async function reserveAndPickup(quantity: number) {
  const { rows } = await (await as()).query("select reserve_bonocopas($1,$2,$3,'Ana','Pérez',$4,'',true,false) r", [f.event, f.type, quantity, `${randomUUID()}@example.invalid`])
  await (await as(f.controller)).query("select record_pickup($1,$2,1,'cash',true,false)", [f.event, rows[0].r.token])
}
async function invite(client: Client, email: string, role = 'controller', event: string | null = null) {
  return (await client.query('select create_invitation($1,$2,null,$3) r', [email, role, event])).rows[0].r as { token: string }
}

beforeAll(async () => { db = await testDatabase() }, 60000)
afterAll(async () => { if (db) await db.stop() }, 30000)
beforeEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.end()))
  f = await fixture()
})

describe('resumen e historial con reservas', () => {
  it('el resumen cuenta reservas y entregas', async () => {
    await reserveAndPickup(3)
    const data = (await (await as(f.organizer)).query('select event_dashboard($1) d', [f.event])).rows[0].d
    expect(data).toMatchObject({ mode: 'pickup', item_name: 'bonocopas', reservations: { reserved_pending: 2, delivered: 1, amount_collected: 15, reservations_active: 1 } })
    expect((await (await as(f.controller)).query('select event_dashboard($1) d', [f.event])).rows[0].d).toBeNull()
  })
  it('el historial incluye entregas con quien las hizo y oculta las consultas previas', async () => {
    await reserveAndPickup(2)
    await db.owner.query("insert into access_logs(event_id,admin_id,result) values($1,$2,'ready'),($1,$3,'not_found')", [f.event, f.controller, f.organizer])
    const h = (await (await as(f.organizer)).query('select event_history($1) h', [f.event])).rows[0].h
    expect(h.total).toBe(2)
    expect(h.rows.map((r: { result: string }) => r.result).sort()).toEqual(['not_found', 'pickup'])
    const pickup = h.rows.find((r: { kind: string }) => r.kind === 'pickup')
    expect(pickup).toMatchObject({ name: 'Ana Pérez', quantity: 1, payment_method: 'cash', staff: `${f.controller}@example.invalid` })
    expect(h.rows.find((r: { kind: string }) => r.kind === 'access').staff).toBe('Olga Org')
    await expect((await as(f.controller)).query('select event_history($1)', [f.event])).rejects.toThrow('FORBIDDEN')
  })
})

describe('invitaciones', () => {
  it('al confirmar la cuenta con el correo invitado entra en el equipo y en el evento', async () => {
    const { token } = await invite(await as(f.organizer), 'Nueva@Example.invalid', 'controller', f.event)
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect((await (await as()).query('select get_invitation($1) i', [token])).rows[0].i).toMatchObject({ email: 'nueva@example.invalid', role: 'controller', status: 'valid', event_title: 'Cotillón' })
    const user = randomUUID()
    await db.owner.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'nueva@example.invalid',now(),$2)", [user, JSON.stringify({ invitation: token })])
    expect((await db.owner.query('select organization_id,role from organization_members where user_id=$1', [user])).rows[0]).toEqual({ organization_id: f.org, role: 'controller' })
    expect((await db.owner.query('select 1 from event_staff where user_id=$1 and event_id=$2', [user, f.event])).rowCount).toBe(1)
    expect((await (await as()).query('select get_invitation($1) i', [token])).rows[0].i.status).toBe('accepted')
  })
  it('no sirve para otro correo, caducada, ni la crea quien no administra', async () => {
    const { token } = await invite(await as(f.organizer), 'alguien@example.invalid')
    const other = randomUUID()
    await db.owner.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'otro@example.invalid',now(),$2)", [other, JSON.stringify({ invitation: token })])
    expect((await db.owner.query('select 1 from organization_members where user_id=$1', [other])).rowCount).toBe(0)
    await db.owner.query("update invitations set expires_at=now()-interval '1 minute' where email='alguien@example.invalid'")
    const late = randomUUID()
    await db.owner.query('insert into auth.users(id,email) values($1,$2)', [late, 'alguien@example.invalid'])
    await expect((await as(late, 'aal1')).query('select accept_invitation($1)', [token])).rejects.toThrow('INVITATION_INVALID')
    await expect(invite(await as(f.controller), 'x@example.invalid')).rejects.toThrow('FORBIDDEN')
    await expect(invite(await as(f.organizer), `${f.controller}@example.invalid`)).rejects.toThrow('ALREADY_MEMBER')
    expect((await (await as(f.controller)).query('select * from invitations')).rowCount).toBe(0)
  })
  it('una cuenta existente sin equipo la acepta tras iniciar sesión', async () => {
    const { token } = await invite(await as(f.organizer), 'existe@example.invalid', 'organizer')
    const user = randomUUID()
    await db.owner.query("insert into auth.users(id,email,email_confirmed_at) values($1,'existe@example.invalid',now())", [user])
    await (await as(user, 'aal1')).query('select accept_invitation($1)', [token])
    expect((await db.owner.query('select role from organization_members where user_id=$1', [user])).rows[0].role).toBe('organizer')
  })
  it('una sesión con correo sin verificar no puede aceptar una invitación', async () => {
    const { token } = await invite(await as(f.organizer), 'unverified@example.invalid', 'organizer')
    const user = randomUUID()
    await db.owner.query("insert into auth.users(id,email) values($1,'unverified@example.invalid')", [user])
    await expect((await as(user, 'aal1')).query('select accept_invitation($1)', [token])).rejects.toThrow('INVITATION_INVALID')
    expect((await db.owner.query('select 1 from organization_members where user_id=$1', [user])).rowCount).toBe(0)
    expect((await db.owner.query('select accepted_at from invitations where email=$1', ['unverified@example.invalid'])).rows[0].accepted_at).toBeNull()
  })
})

describe('borrado de cuentas', () => {
  it('borrar al personal no borra eventos', async () => {
    const r = (await (await as(f.organizer)).query('select delete_account($1) r', [f.controller])).rows[0].r
    expect(r.deleted_events).toBe(0)
    expect((await db.owner.query('select 1 from auth.users where id=$1', [f.controller])).rowCount).toBe(0)
    expect((await db.owner.query('select 1 from events where id=$1', [f.event])).rowCount).toBe(1)
  })
  it('borrar al único administrador borra sus eventos con todo lo que tienen', async () => {
    await reserveAndPickup(2)
    const admin = randomUUID()
    await db.owner.query('insert into auth.users(id) values($1)', [admin])
    await db.owner.query('insert into admins(user_id) values($1)', [admin])
    const team = (await (await as(admin)).query('select list_team() t')).rows[0].t
    expect(team.find((m: { user_id: string }) => m.user_id === f.organizer).owned_events).toEqual(['Cotillón'])
    const r = (await (await as(admin)).query('select delete_account($1) r', [f.organizer])).rows[0].r
    expect(r.deleted_events).toBe(1)
    expect((await db.owner.query('select 1 from events where id=$1', [f.event])).rowCount).toBe(0)
    expect((await db.owner.query('select 1 from reservations where event_id=$1', [f.event])).rowCount).toBe(0)
    // El controlador sigue en el grupo, que se conserva.
    expect((await db.owner.query('select 1 from organizations where id=$1', [f.org])).rowCount).toBe(1)
  })
  it('si queda otro administrador, los eventos se quedan; nadie se borra a sí mismo ni a otro equipo', async () => {
    const second = randomUUID()
    await db.owner.query('insert into auth.users(id) values($1)', [second])
    await db.owner.query("insert into organization_members values($1,$2,'organizer')", [second, f.org])
    expect((await (await as(second)).query('select delete_account($1) r', [f.organizer])).rows[0].r.deleted_events).toBe(0)
    expect((await db.owner.query('select 1 from events where id=$1', [f.event])).rowCount).toBe(1)
    await expect((await as(second)).query('select delete_account($1)', [second])).rejects.toThrow('CANNOT_DELETE_SELF')
    const foreign = await fixture()
    await expect((await as(second)).query('select delete_account($1)', [foreign.organizer])).rejects.toThrow('FORBIDDEN')
    await expect((await as(f.controller)).query('select delete_account($1)', [second])).rejects.toThrow('FORBIDDEN')
  })
})

describe('borrar la propia cuenta', () => {
  it('el único administrador se borra con sus eventos y el grupo vacío desaparece', async () => {
    await db.owner.query('delete from auth.users where id=$1', [f.controller])
    const me = await as(f.organizer)
    expect((await me.query('select own_account_summary() s')).rows[0].s).toEqual({ owned_events: ['Cotillón'], last_superadmin: false })
    expect((await me.query('select delete_own_account() r')).rows[0].r.deleted_events).toBe(1)
    expect((await db.owner.query('select 1 from auth.users where id=$1', [f.organizer])).rowCount).toBe(0)
    expect((await db.owner.query('select 1 from events where id=$1', [f.event])).rowCount).toBe(0)
    expect((await db.owner.query('select 1 from organizations where id=$1', [f.org])).rowCount).toBe(0)
  })
  it('el personal se borra sin tocar eventos; exige dos pasos y no deja la plataforma sin superadministrador', async () => {
    await expect((await as(f.controller, 'aal1')).query('select delete_own_account()')).rejects.toThrow('FORBIDDEN')
    expect((await (await as(f.controller)).query('select delete_own_account() r')).rows[0].r.deleted_events).toBe(0)
    expect((await db.owner.query('select 1 from events where id=$1', [f.event])).rowCount).toBe(1)
    await db.owner.query('delete from admins')
    const admin = randomUUID()
    await db.owner.query('insert into auth.users(id) values($1)', [admin])
    await db.owner.query('insert into admins(user_id) values($1)', [admin])
    expect((await (await as(admin)).query('select own_account_summary() s')).rows[0].s.last_superadmin).toBe(true)
    await expect((await as(admin)).query('select delete_own_account()')).rejects.toThrow('LAST_SUPERADMIN')
    await expect((await as()).query('select delete_own_account()')).rejects.toThrow()
  })
})

describe('ubicación del evento en la base de datos', () => {
  it('guarda las coordenadas y rechaza una sola o fuera de rango', async () => {
    await db.owner.query('update events set latitude=41.31,longitude=-4.91 where id=$1', [f.event])
    await expect(db.owner.query('update events set latitude=null where id=$1', [f.event])).rejects.toThrow('events_location_check')
    await expect(db.owner.query('update events set latitude=95 where id=$1', [f.event])).rejects.toThrow('events_location_check')
  })
})

describe('portadas al borrar', () => {
  const name = `${randomUUID()}/${randomUUID()}.webp`
  it('sabe si un evento usa una imagen, aunque quien pregunta no vea ese evento', async () => {
    await db.owner.query("update events set cover_url=$1, published=false, status='draft' where id=$2", [`https://abc.supabase.co/storage/v1/object/public/event-covers/${name}`, f.event])
    const outsider = (await fixture()).organizer
    expect((await (await as(outsider)).query('select cover_in_use($1) u', [name])).rows[0].u).toBe(true)
    expect((await (await as(outsider)).query('select cover_in_use($1) u', [`${randomUUID()}/x.webp`])).rows[0].u).toBe(false)
  })
  it('borrar la cuenta devuelve las portadas de los eventos que se lleva', async () => {
    await db.owner.query('update events set cover_url=$1 where id=$2', ['https://abc.supabase.co/x.webp', f.event])
    await db.owner.query('delete from auth.users where id=$1', [f.controller])
    expect((await (await as(f.organizer)).query('select delete_own_account() r')).rows[0].r).toEqual({ deleted_events: 1, covers: ['https://abc.supabase.co/x.webp'] })
  })
})
