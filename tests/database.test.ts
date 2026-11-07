import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { testDatabase } from './helpers/postgres'

let db: Awaited<ReturnType<typeof testDatabase>>
type Fixture = { org: string; user: string; controller: string; event: string; type: string; template: string }
let a: Fixture, b: Fixture
const connections: Client[] = []

async function as(user = '', aal = 'aal2') {
  const connection = await db.connect(user, aal)
  connections.push(connection)
  return connection
}
async function fixture(): Promise<Fixture> {
  const f = Object.fromEntries(['org','user','controller','event','type','template'].map((key) => [key, randomUUID()])) as Fixture
  await db.owner.query('insert into auth.users values($1),($2)', [f.user,f.controller])
  await db.owner.query("insert into organizations values($1,'Test organization')", [f.org])
  await db.owner.query("insert into organization_members values($1,$2,'organizer'),($3,$2,'controller')", [f.user,f.org,f.controller])
  await db.owner.query("insert into ticket_templates(id,name,organization_id) values($1,'Test template',$2)", [f.template,f.org])
  await db.owner.query("insert into events(id,slug,title,starts_at,published,organization_id,capacity) values($1::uuid,$1::text,'Test event',now()+interval '1 day',true,$2,10)", [f.event,f.org])
  await db.owner.query("insert into ticket_types(id,event_id,name,capacity,max_per_order,template_id) values($1,$2,'General',10,5,$3)", [f.type,f.event,f.template])
  await db.owner.query('insert into event_staff values($1,$2)', [f.event,f.controller])
  return f
}
async function buy(client: Client, f = a, items = [{ticket_type_id:f.type,quantity:1}], requestId: string | null = null) {
  return client.query('select purchase_tickets($1,$2,$3,$4::jsonb,$5) token',
    [f.event,'Synthetic Buyer','test@example.invalid',JSON.stringify(items),requestId])
}
async function ticket(f = a) {
  return (await db.owner.query('select * from tickets where event_id=$1 order by created_at limit 1',[f.event])).rows[0]
}
async function scan(client: Client, code: string, event: string | null = null) {
  return (await client.query('select validate_ticket($1,$2) result',[code,event])).rows[0].result
}

beforeAll(async () => { db = await testDatabase() }, 60000)
afterAll(async () => { if (db) await db.stop() }, 30000)
beforeEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.end()))
  a = await fixture(); b = await fixture()
})

describe('PostgreSQL real: roles, RLS y emisión', () => {
  it('comprador no lee pedidos/entradas directamente ni obtiene un pedido por su id', async () => {
    const anon = await as()
    const token = (await buy(anon)).rows[0].token
    const order = (await db.owner.query('select id from orders where access_token=$1',[token])).rows[0]
    expect((await anon.query('select * from orders')).rowCount).toBe(0)
    expect((await anon.query('select * from tickets')).rowCount).toBe(0)
    expect((await anon.query('select get_order($1) data',[order.id])).rows[0].data).toBeNull()
    expect((await anon.query('select get_order($1) data',[token])).rows[0].data.tickets).toHaveLength(1)
    expect((await anon.query('select get_order($1) data',[token])).rows[0].data).not.toHaveProperty('buyer_email')
  })
  it('organización A no lee, modifica ni elimina datos privados de B aunque conoce sus IDs', async () => {
    await buy(await as(),b)
    await db.owner.query('update events set published=false where id=$1',[b.event])
    const orgA = await as(a.user)
    for (const [table,column,id] of [['events','id',b.event],['ticket_templates','id',b.template],['orders','event_id',b.event],['tickets','event_id',b.event]]) {
      expect((await orgA.query(`select * from ${table} where ${column}=$1`,[id])).rowCount).toBe(0)
    }
    expect((await orgA.query("update events set title='Changed' where id=$1",[b.event])).rowCount).toBe(0)
    expect((await orgA.query('delete from events where id=$1',[b.event])).rowCount).toBe(0)
    expect((await orgA.query('delete from ticket_templates where id=$1',[b.template])).rowCount).toBe(0)
    expect((await orgA.query("update tickets set status='cancelled' where event_id=$1",[b.event])).rowCount).toBe(0)
    expect((await orgA.query('select * from event_ticket_stats($1)',[b.event])).rowCount).toBe(0)
  })
  it('precio solo lo modifica organizador autorizado con AAL2; comprador/controlador/AAL1 no', async () => {
    for (const client of [await as(), await as(a.controller), await as(a.user,'aal1'), await as(b.user)]) {
      expect((await client.query('update ticket_types set price=1 where id=$1',[a.type])).rowCount).toBe(0)
    }
    expect((await (await as(a.user)).query('update ticket_types set price=1 where id=$1',[a.type])).rowCount).toBe(1)
  })
  it('MFA es obligatorio incluso si se evita Next y se llama a PostgreSQL', async () => {
    const low = await as(a.user,'aal1')
    expect((await low.query('select staff_role() role')).rows[0].role).toBeNull()
    expect((await low.query('select * from orders')).rowCount).toBe(0)
    expect((await scan(low,'A'.repeat(32))).result).toBe('forbidden')
  })
  it('no permite autopromoción ni asignarse otra organización', async () => {
    const client = await as(a.user)
    await expect(client.query("update organization_members set role='organizer' where user_id=$1",[a.controller])).rejects.toMatchObject({code:'42501'})
    await expect(client.query('insert into admins(user_id) values($1)',[a.user])).rejects.toMatchObject({code:'42501'})
    await expect(client.query('update events set organization_id=$1 where id=$2',[b.org,a.event])).rejects.toBeDefined()
    await expect(client.query('update ticket_types set template_id=$1 where id=$2',[b.template,a.type])).rejects.toMatchObject({message:'INVALID_TEMPLATE'})
  })
  it('controlador solo ve sus eventos asignados y no modifica estados directamente', async () => {
    await buy(await as())
    const controller = await as(a.controller)
    expect((await controller.query('select id from staff_events()')).rows.map((row) => row.id)).toEqual([a.event])
    expect((await controller.query("update tickets set status='cancelled' where event_id=$1",[a.event])).rowCount).toBe(0)
    expect((await controller.query('select * from orders')).rowCount).toBe(0)
  })
  it('rechaza duplicados, cantidades fraccionarias, negativas, tipos ajenos y más de 50 entradas', async () => {
    const client=await as()
    for(const items of [
      [{ticket_type_id:a.type,quantity:3},{ticket_type_id:a.type.toUpperCase(),quantity:3}],
      [{ticket_type_id:a.type,quantity:1.5}], [{ticket_type_id:a.type,quantity:-1}],
      [{ticket_type_id:b.type,quantity:1}], [{ticket_type_id:a.type,quantity:51}],
    ]) await expect(buy(client,a,items)).rejects.toMatchObject({message:'INVALID_INPUT'})
    expect((await db.owner.query('select count(*)::int n from orders where event_id=$1',[a.event])).rows[0].n).toBe(0)
  })
  it('la clave de reintento crea un solo pedido y rechaza cambio de payload', async () => {
    const key=randomUUID(), clients=await Promise.all([as(),as()])
    const result=await Promise.all(clients.map((client)=>buy(client,a,undefined,key)))
    expect(result[0].rows[0].token).toBe(result[1].rows[0].token)
    expect((await db.owner.query('select count(*)::int n from tickets where event_id=$1',[a.event])).rows[0].n).toBe(1)
    await expect(buy(clients[0],a,[{ticket_type_id:a.type,quantity:2}],key)).rejects.toMatchObject({message:'IDEMPOTENCY_CONFLICT'})
  })
  it('nadie puede insertar entradas ni marcar pagos desde la API de tablas', async () => {
    const client = await as(a.user)
    await expect(client.query("insert into orders(event_id,buyer_name,buyer_email) values($1,'Synthetic','test@example.invalid')",[a.event])).rejects.toMatchObject({code:'42501'})
    await expect(client.query("update orders set buyer_name='Changed' where event_id=$1",[a.event])).rejects.toMatchObject({code:'42501'})
  })
})

describe('PostgreSQL real: concurrencia y aforo', () => {
  it('20 compradores con conexiones independientes compiten por las 3 últimas entradas', async () => {
    await db.owner.query('update ticket_types set capacity=3 where id=$1',[a.type])
    const clients=await Promise.all(Array.from({length:20},()=>as()))
    const outcomes=await Promise.allSettled(clients.map((client)=>buy(client)))
    expect(outcomes.filter((outcome)=>outcome.status==='fulfilled')).toHaveLength(3)
    expect((await db.owner.query('select count(*)::int n from tickets where event_id=$1',[a.event])).rows[0].n).toBe(3)
  }, 30000)
  it('aforo total se respeta con dos tipos de entrada distintos', async () => {
    await db.owner.query('update events set capacity=1 where id=$1',[a.event])
    const other=randomUUID()
    await db.owner.query("insert into ticket_types(id,event_id,name,capacity) values($1,$2,'Other',10)",[other,a.event])
    const clients=await Promise.all([as(),as()])
    const outcomes=await Promise.allSettled([buy(clients[0]),buy(clients[1],a,[{ticket_type_id:other,quantity:1}])])
    expect(outcomes.filter((outcome)=>outcome.status==='fulfilled')).toHaveLength(1)
  })
  it('reactivación tras vender el cupo liberado no causa sobreventa', async () => {
    await db.owner.query('update ticket_types set capacity=1 where id=$1',[a.type])
    const anon=await as(), admin=await as(a.user)
    await buy(anon); const first=await ticket()
    await admin.query("update tickets set status='cancelled' where id=$1",[first.id])
    await buy(anon)
    await expect(admin.query("update tickets set status='valid' where id=$1",[first.id])).rejects.toMatchObject({message:'SOLD_OUT'})
    expect((await db.owner.query("select count(*)::int n from tickets where event_id=$1 and status <> 'cancelled'",[a.event])).rows[0].n).toBe(1)
  })
  it('no permite reducir aforo de tipo o evento por debajo de emitidos', async () => {
    await buy(await as(),a,[{ticket_type_id:a.type,quantity:2}])
    const admin=await as(a.user)
    await expect(admin.query('update ticket_types set capacity=1 where id=$1',[a.type])).rejects.toMatchObject({message:'CAPACITY_BELOW_SOLD'})
    await expect(admin.query('update events set capacity=1 where id=$1',[a.event])).rejects.toMatchObject({message:'CAPACITY_BELOW_SOLD'})
  })
  it('reactivación y compra simultáneas compiten por el mismo cupo', async () => {
    await db.owner.query('update ticket_types set capacity=1 where id=$1',[a.type])
    const buyer=await as(), admin=await as(a.user)
    await buy(buyer); const entry=await ticket()
    await admin.query("update tickets set status='cancelled' where id=$1",[entry.id])
    const outcomes=await Promise.allSettled([buy(buyer),admin.query("update tickets set status='valid' where id=$1",[entry.id])])
    expect(outcomes.filter((outcome)=>outcome.status==='fulfilled')).toHaveLength(1)
    expect((await db.owner.query("select count(*)::int n from tickets where event_id=$1 and status <> 'cancelled'",[a.event])).rows[0].n).toBe(1)
  })
  it('bajar aforo y comprar simultáneamente mantiene la invariante', async () => {
    await db.owner.query('update ticket_types set capacity=2 where id=$1',[a.type])
    const buyer=await as(), admin=await as(a.user)
    await buy(buyer)
    const outcomes=await Promise.allSettled([buy(buyer),admin.query('update ticket_types set capacity=1 where id=$1',[a.type])])
    expect(outcomes.filter((outcome)=>outcome.status==='fulfilled')).toHaveLength(1)
    const data=(await db.owner.query("select capacity,(select count(*) from tickets where ticket_type_id=$1 and status <> 'cancelled')::int n from ticket_types where id=$1",[a.type])).rows[0]
    expect(data.n).toBeLessThanOrEqual(data.capacity)
  })
})

describe('PostgreSQL real: escaneo y auditoría', () => {
  it('dos dispositivos validan simultáneamente: solo uno registra acceso', async () => {
    await buy(await as()); const entry=await ticket()
    expect(entry.code).toMatch(/^[A-F0-9]{32}$/)
    const devices=await Promise.all([as(a.controller),as(a.controller)])
    const result=await Promise.all(devices.map((client)=>scan(client,entry.code,a.event)))
    expect(result.map((r)=>r.result).sort()).toEqual(['already_used','valid'])
    expect((await ticket()).validated_by).toBe(a.controller)
  })
  it('controlador no escanea eventos ajenos y rechazo no filtra nombre', async () => {
    await buy(await as(),b); const entry=await ticket(b)
    const result=await scan(await as(a.controller),entry.code,b.event)
    expect(result.result).toBe('not_found')
    expect(result).not.toHaveProperty('attendee_name')
    expect((await ticket(b)).status).toBe('valid')
  })
  it('evento incorrecto no revela detalles personales ni consume entrada', async () => {
    await buy(await as()); const entry=await ticket()
    const result=await scan(await as(a.user),entry.code,b.event)
    expect(result).toEqual({result:'wrong_event',code:entry.code})
    expect((await ticket()).status).toBe('valid')
  })
  it('el límite de escaneo persiste también con códigos inexistentes', async () => {
    await db.owner.query("insert into private.scan_limits values($1,date_trunc('minute',clock_timestamp()),120)",[a.controller])
    expect((await scan(await as(a.controller),'F'.repeat(32))).result).toBe('rate_limited')
    const log=(await db.owner.query('select * from private.security_audit where actor_id=$1',[a.controller])).rows
    expect(log.some((r)=>r.outcome==='rate_limited')).toBe(true)
    expect(JSON.stringify(log)).not.toContain('FFFFFFFF')
    expect(JSON.stringify(log)).not.toContain('example.invalid')
    await expect((await as(a.controller)).query('select * from private.security_audit')).rejects.toMatchObject({code:'42501'})
  })
  it('mantiene compatibilidad con entradas antiguas de 16 caracteres', async () => {
    await buy(await as()); const entry=await ticket()
    await db.owner.query("insert into tickets(code,order_id,event_id,ticket_type_id,attendee_name) values('ABCDEF0123456789',$1,$2,$3,'Synthetic Buyer')",[entry.order_id,a.event,a.type])
    expect((await scan(await as(a.controller),'ABCD-EF01-2345-6789',a.event)).result).toBe('valid')
  })
})

describe('bloqueo de emisión sin pasarela de pago', () => {
  it('bloquea entradas con precio en BD aunque el cliente envíe un precio cero', async () => {
      await db.owner.query('update ticket_types set price=20 where id=$1',[a.type])
      await expect((await as()).query('select purchase_tickets($1,$2,$3,$4::jsonb)',[
        a.event,'Test Buyer','test@example.invalid',JSON.stringify([{ticket_type_id:a.type,quantity:1,price:0}]),
      ])).rejects.toMatchObject({message:'PAYMENTS_NOT_CONFIGURED'})
      expect((await db.owner.query('select count(*)::int n from orders where event_id=$1',[a.event])).rows[0].n).toBe(0)
      expect((await db.owner.query('select count(*)::int n from tickets where event_id=$1',[a.event])).rows[0].n).toBe(0)
      await expect(buy(await as(),b)).resolves.toBeDefined()
  })
})

describe('alta pública de organizadores', () => {
  const members = (user: string) => db.owner.query(
    'select m.role, o.name from organization_members m join organizations o on o.id=m.organization_id where m.user_id=$1', [user])
  it('crea su grupo como organizer solo al confirmar el correo', async () => {
    const user = randomUUID()
    await db.owner.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [user, {organization_name:'  Peña El Toro  '}])
    expect((await members(user)).rowCount).toBe(0)
    await db.owner.query('update auth.users set email_confirmed_at=now() where id=$1', [user])
    expect((await members(user)).rows).toEqual([{role:'organizer',name:'Peña El Toro'}])
    await db.owner.query('update auth.users set email_confirmed_at=now() where id=$1', [user])
    expect((await members(user)).rowCount).toBe(1)
  })
  it('ignora cuentas sin grupo, con nombre no válido o ya autorizadas', async () => {
    const [none, long, existing] = [randomUUID(), randomUUID(), randomUUID()]
    await db.owner.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [none])
    await db.owner.query("insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values($1,now(),$2)", [long, {organization_name:'x'.repeat(121)}])
    await db.owner.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [existing, {organization_name:'Otro grupo'}])
    await db.owner.query("insert into organization_members values($1,$2,'controller')", [existing, a.org])
    await db.owner.query('update auth.users set email_confirmed_at=now() where id=$1', [existing])
    expect((await members(none)).rowCount).toBe(0)
    expect((await members(long)).rowCount).toBe(0)
    expect((await members(existing)).rows).toEqual([{role:'controller',name:'Test organization'}])
  })
})

describe('creación de eventos desde el panel', () => {
  it('el organizador crea un borrador y recibe su id; otra organización no lo ve', async () => {
    const orgA = await as(a.user)
    const created = await orgA.query("insert into events(slug,title,starts_at,published,status) values($1,'Borrador',now()+interval '1 day',false,'draft') returning id, organization_id", [randomUUID()])
    expect(created.rows[0].organization_id).toBe(a.org)
    expect((await (await as(b.user)).query('select id from events where id=$1', [created.rows[0].id])).rowCount).toBe(0)
    expect((await (await as()).query('select id from events where id=$1', [created.rows[0].id])).rowCount).toBe(0)
  })
})
