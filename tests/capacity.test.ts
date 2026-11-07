import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { testDatabase } from './helpers/postgres'

// Apertura de reservas con 1.000 personas a la vez: todas entran hasta el aforo y nadie más.
let db: Awaited<ReturnType<typeof testDatabase>>
beforeAll(async () => { db = await testDatabase() }, 60000)
afterAll(async () => { if (db) await db.stop() }, 30000)

async function pickupEvent(capacity: number) {
  const org = randomUUID(), event = randomUUID(), type = randomUUID()
  await db.owner.query("insert into organizations values($1,'Cuadrilla')", [org])
  await db.owner.query(`insert into events(id,slug,title,starts_at,published,status,organization_id,capacity,registration_enabled,registration_mode,
      privacy_controller,privacy_contact,pickup_deadline)
    values($1::uuid,$1::text,'Cotillón',now()+interval '30 days',true,'published',$2,$3,true,'pickup','Cuadrilla','privacidad@example.invalid',now()+interval '20 days')`,
    [event, org, capacity])
  await db.owner.query("insert into ticket_types(id,event_id,name,price,max_per_order) values($1,$2,'Bonocopas',15,4)", [type, event])
  return { event, type }
}

describe('picos de público', () => {
  it('1.000 reservas simultáneas: todas confirmadas, sin vender de más ni límites de intentos', async () => {
    const people = 1000, { event, type } = await pickupEvent(people)
    // 30 conexiones en paralelo (las que admite la base de pruebas), como un servidor con muchas peticiones a la vez.
    const clients: Client[] = await Promise.all(Array.from({ length: 30 }, () => db.connect('')))
    const queue = Array.from({ length: people + 50 }, (_, i) => i), results: string[] = []
    const started = Date.now()
    await Promise.all(clients.map(async (c) => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        const { rows } = await c.query("select reserve_bonocopas($1,$2,1,'Ana','Pérez',$3,'',true,false) r", [event, type, `p${i}-${randomUUID()}@example.invalid`])
        results.push(rows[0].r.error ?? 'ok')
      }
    }))
    const seconds = (Date.now() - started) / 1000
    await Promise.all(clients.map((c) => c.end()))

    const count = (k: string) => results.filter((r) => r === k).length
    expect(count('ok')).toBe(people)
    expect(count('SOLD_OUT')).toBe(50)
    expect(count('RATE_LIMITED')).toBe(0)
    const stored = (await db.owner.query('select count(*)::int n, count(distinct code)::int codes from reservations where event_id=$1', [event])).rows[0]
    expect(stored).toEqual({ n: people, codes: people })
    // Margen amplio: en local tarda unos segundos; si tardara más de un minuto algo va mal.
    expect(seconds).toBeLessThan(60)
  }, 120000)

  it('sala de espera: orden de llegada, personas delante y sin saltarse la cola', async () => {
    const { event, type } = await pickupEvent(100)
    await db.owner.query('update events set queue_enabled=true, queue_capacity=2 where id=$1', [event])
    const anon = await db.connect('')
    const status = async (token?: string) => (await anon.query('select queue_status($1,$2) s', [event, token ?? null])).rows[0].s
    const reserve = async (pass: string | null, email = `${randomUUID()}@example.invalid`) =>
      (await anon.query("select reserve_with_pass($1,$2,$3,1,'Ana','Pérez',$4,'',true) r", [pass, event, type, email])).rows[0].r

    // Hay sitio para 2 en el formulario: las 2 primeras entran, las demás esperan por orden.
    const people = []
    for (let i = 0; i < 5; i++) people.push(await status())
    expect(people.map((p) => p.status)).toEqual(['admitted', 'admitted', 'waiting', 'waiting', 'waiting'])
    expect(people.slice(2).map((p) => p.ahead)).toEqual([0, 1, 2])
    expect(people[4].eta_minutes).toBeGreaterThan(0)

    // Sin pase, con un pase en espera o llamando a la función antigua no se puede reservar.
    expect((await reserve(null)).error).toBe('QUEUE_REQUIRED')
    expect((await reserve(people[2].token)).error).toBe('QUEUE_REQUIRED')
    expect((await anon.query("select reserve_bonocopas($1,$2,1,'Ana','Pérez','x@example.invalid','',true,false) r", [event, type])).rows[0].r.error).toBe('QUEUE_REQUIRED')

    // Con turno se reserva una sola vez; al terminar entra el siguiente de la cola.
    expect((await reserve(people[0].token)).token).toMatch(/^[a-f0-9]{64}$/)
    expect((await reserve(people[0].token)).error).toBe('QUEUE_REQUIRED')
    expect((await status(people[2].token)).status).toBe('admitted')
    expect((await status(people[3].token)).ahead).toBe(0)

    // Un turno caducado vuelve al final; quien deja de consultar no cuenta como «delante».
    await db.owner.query("update private.queue_entries set admitted_at=now()-interval '16 minutes' where token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')", [people[1].token])
    await db.owner.query("update private.queue_entries set last_seen_at=now()-interval '1 minute' where token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')", [people[3].token])
    expect((await status(people[4].token)).status).toBe('admitted')
    const late = await status(people[1].token)
    expect(late.status).toBe('waiting')
    expect(late.token).not.toBe(people[1].token)

    await anon.end()
  })

  it('sin sala de espera activada todo sigue como antes', async () => {
    const { event, type } = await pickupEvent(10), c = await db.connect('')
    expect((await c.query('select queue_status($1) s', [event])).rows[0].s).toEqual({ status: 'open' })
    expect((await c.query("select reserve_with_pass('',$1,$2,1,'Ana','Pérez',$3,'',true) r", [event, type, `${randomUUID()}@example.invalid`])).rows[0].r.token).toBeDefined()
    await c.end()
  })

  it('el límite por correo sigue frenando a quien repite', async () => {
    const { event, type } = await pickupEvent(100), c = await db.connect('')
    const out: string[] = []
    for (let i = 0; i < 7; i++) out.push((await c.query("select reserve_bonocopas($1,$2,1,'Ana','Pérez','repite@example.invalid','',true,false) r", [event, type])).rows[0].r.error ?? 'ok')
    await c.end()
    expect(out.filter((r) => r === 'RATE_LIMITED').length).toBeGreaterThan(0)
  })
})
