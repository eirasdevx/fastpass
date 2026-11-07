import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { testDatabase } from './helpers/postgres'

let db: Awaited<ReturnType<typeof testDatabase>>
let event: string, type: string, admin: string, controller: string, outsider: string
let clients: Client[] = []
let historical: {id:string;code:string;used_at:Date;validated_by:string}
async function as(user = '') { const c = await db.connect(user); clients.push(c); return c }
async function register(c: Client, overrides: Record<string, unknown> = {}) {
  const v = { event, type, first: 'Ana', last: 'Prueba', email: `${randomUUID()}@example.invalid`, phone: '', consent: true, manual: false, approve: false, notes: '', ...overrides }
  return (await c.query('select register_attendee($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) data', Object.values(v))).rows[0].data
}
async function entry() { return (await db.owner.query('select * from tickets where event_id=$1',[event])).rows[0] }
async function scan(c: Client, code: string, confirm = false, ev = event) { return (await c.query('select lookup_entry($1,$2,$3) data',[ev,code,confirm])).rows[0].data }
beforeAll(async () => { db = await testDatabase(async owner=>{
  const user=randomUUID(),org=randomUUID(),ev=randomUUID(),tt=randomUUID(),order=randomUUID()
  await owner.query('insert into auth.users values($1)',[user])
  await owner.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,aal:'aal2'})])
  await owner.query("insert into organizations values($1,'Historical synthetic')",[org])
  await owner.query("insert into events(id,slug,title,starts_at,published,organization_id) values($1::uuid,$1::text,'Historical',now()+interval '1 day',true,$2)",[ev,org])
  await owner.query("insert into ticket_types(id,event_id,name) values($1,$2,'General')",[tt,ev])
  await owner.query("insert into orders(id,event_id,buyer_name,buyer_email) values($1,$2,'Historical','history@example.invalid')",[order,ev])
  historical=(await owner.query("insert into tickets(event_id,order_id,ticket_type_id,attendee_name,code,status) values($1,$2,$3,'Historical','ABCDEF1234567890','used') returning id,code,used_at,validated_by",[ev,order,tt])).rows[0]
  await owner.query("select set_config('request.jwt.claims','{}',false)")
}) }, 60000)
afterAll(async () => { if (db) await db.stop() }, 30000)
beforeEach(async () => {
  await Promise.all(clients.map(c=>c.end())); clients=[]
  event=randomUUID(); type=randomUUID(); admin=randomUUID(); controller=randomUUID(); outsider=randomUUID()
  const org=randomUUID()
  await db.owner.query('insert into auth.users values($1),($2),($3)',[admin,controller,outsider])
  await db.owner.query("insert into organizations values($1,'Synthetic')",[org])
  await db.owner.query("insert into organization_members values($1,$2,'organizer'),($3,$2,'controller')",[admin,org,controller])
  await db.owner.query("insert into events(id,slug,title,starts_at,published,organization_id,capacity,status,registration_enabled,registration_mode,privacy_controller,privacy_contact) values($1::uuid,$1::text,'Test',now()+interval '1 day',true,$2,10,'published',true,'automatic','Synthetic operator','privacy@example.invalid')",[event,org])
  await db.owner.query("insert into ticket_types(id,event_id,name,capacity) values($1,$2,'General',10)",[type,event])
  await db.owner.query('insert into event_staff values($1,$2)',[event,controller])
})

describe('registro real e integración con pedidos existentes',()=>{
  it('la migración asigna código a entradas antiguas sin alterar validación ni QR',async()=>{
    const row=(await db.owner.query('select id,code,short_code,used_at,validated_by,status from tickets where id=$1',[historical.id])).rows[0]
    expect(row).toMatchObject({...historical,status:'used'})
    expect(row.short_code).toMatch(/^[A-Z0-9]{4}$/)
  })
  it('registro válido emite código de 4 caracteres y enlace privado con hash',async()=>{
    const anon=await as(), r=await register(anon)
    expect(r.status).toBe('approved'); expect(r.token).toMatch(/^[a-f0-9]{64}$/)
    const t=await entry(); expect(t.short_code).toMatch(/^[A-Z0-9]{4}$/)
    const view=(await anon.query('select get_entry($1) data',[r.token])).rows[0].data
    expect(view.attendee_name).toBe('Ana Prueba'); expect(view.status).toBe('valid')
    expect(view).not.toHaveProperty('email'); expect(view).not.toHaveProperty('notes')
    expect((await db.owner.query('select token_hash from private.entry_links where ticket_id=$1',[t.id])).rows[0].token_hash).not.toBe(r.token)
    for(const token of [t.id,t.short_code,'a'.repeat(64)]) expect((await anon.query('select get_entry($1) data',[token])).rows[0].data).toBeNull()
    expect((await anon.query('select * from tickets')).rowCount).toBe(0)
  })
  it('rechaza datos, consentimiento, tipo ajeno y estados enviados por el público',async()=>{
    const c=await as()
    for(const v of [{first:''},{email:'bad'},{consent:false},{approve:true},{manual:true},{type:randomUUID()},{notes:'secret'},{last:''}]) expect((await register(c,v)).error).toBeDefined()
    expect(await entry()).toBeUndefined()
  })
  it('solicitud manual no emite hasta aprobación; enlaces conservan estado',async()=>{
    await db.owner.query("update events set registration_mode='manual' where id=$1",[event])
    const c=await as(), r=await register(c)
    expect(r.status).toBe('pending'); expect(await entry()).toBeUndefined()
    expect((await c.query('select get_entry($1) data',[r.token])).rows[0].data.status).toBe('pending')
    const reg=(await db.owner.query('select id from registrations where event_id=$1',[event])).rows[0].id
    await expect((await as(controller)).query("select manage_registration($1,'approve')",[reg])).rejects.toMatchObject({message:'FORBIDDEN'})
    await (await as(admin)).query("select manage_registration($1,'approve')",[reg])
    expect((await c.query('select get_entry($1) data',[r.token])).rows[0].data.status).toBe('valid')
  })
  it('alta manual aprobada y edición con permisos, revocación y rotación',async()=>{
    const c=await as(admin), r=await register(c,{manual:true,approve:true,consent:false,notes:'Internal'})
    expect(r.status).toBe('approved');const t=await entry()
    const fresh=(await c.query("select manage_registration($1,'rotate') data",[t.registration_id])).rows[0].data.token
    expect((await c.query('select get_entry($1) data',[r.token])).rows[0].data).toBeNull()
    await c.query('select edit_attendee($1,$2,$3,$4,$5,$6)',[t.registration_id,'Eva','Prueba','eva@example.invalid','','Edited'])
    expect((await c.query('select get_entry($1) data',[fresh])).rows[0].data.attendee_name).toBe('Eva Prueba')
    await c.query("select manage_registration($1,'revoke')",[t.registration_id])
    expect((await c.query('select get_entry($1) data',[fresh])).rows[0].data).toBeNull()
  })
  it('duplicados por email se normalizan y solicitudes pendientes reservan aforo',async()=>{
    const c=await as()
    await register(c,{email:'same@example.invalid'})
    expect((await register(c,{email:'SAME@example.invalid'})).error).toBe('DUPLICATE_REGISTRATION')
    await db.owner.query("update events set capacity=2,registration_mode='manual' where id=$1",[event])
    expect((await register(c)).status).toBe('pending')
    expect((await register(c)).error).toBe('SOLD_OUT')
  })
  it('no se puede evitar la aprobación con purchase_tickets',async()=>{
    await expect((await as()).query('select purchase_tickets($1,$2,$3,$4::jsonb)',[event,'Test User','test@example.invalid',JSON.stringify([{ticket_type_id:type,quantity:1}])])).rejects.toMatchObject({message:'REGISTRATION_REQUIRED'})
  })
  it('dos altas concurrentes compiten por una plaza sin sobreventa',async()=>{
    await db.owner.query('update events set capacity=1 where id=$1',[event])
    const cs=await Promise.all([as(),as()]); const outcomes=await Promise.all(cs.map(c=>register(c)))
    expect(outcomes.filter(o=>o.status==='approved')).toHaveLength(1)
    expect(outcomes.filter(o=>o.error==='SOLD_OUT')).toHaveLength(1)
  })
  it('unicidad por evento, restricción SQL y paginación/búsqueda',async()=>{
    const c=await as()
    for(let i=0;i<10;i++) expect((await register(c)).status).toBe('approved')
    const codes=(await db.owner.query('select short_code from tickets where event_id=$1',[event])).rows.map(r=>r.short_code)
    expect(new Set(codes).size).toBe(10)
    const a=await as(admin)
    const page=(await a.query("select list_attendees($1,'','',null,2,3) data",[event])).rows[0].data
    expect(page.total).toBe(10);expect(page.rows).toHaveLength(3)
    const search=(await a.query('select list_attendees($1,$2) data',[event,codes[0]])).rows[0].data
    expect(search.rows).toHaveLength(1)
    expect((await a.query("select list_attendees($1,'Ana','valid') data",[event])).rows[0].data.total).toBe(10)
    await expect((await as(outsider)).query('select list_attendees($1)',[event])).rejects.toMatchObject({message:'FORBIDDEN'})
  })
  it('límites persistentes de registro y de búsquedas',async()=>{
    const c=await as()
    // Límite de todo el evento: 3.000 por minuto desde 0017.
    await db.owner.query('insert into private.registration_limits values($1,clock_timestamp(),3000)',['event:'+event])
    expect((await register(c)).error).toBe('RATE_LIMITED')
    await db.owner.query("insert into private.scan_limits values($1,date_trunc('minute',clock_timestamp()),120)",[controller])
    expect((await scan(await as(controller),'ZZZZ')).result).toBe('rate_limited')
  })
  it('la restricción SQL impide repetir un código dentro del evento',async()=>{
    await register(await as());const t=await entry()
    await expect(db.owner.query('insert into tickets(order_id,event_id,ticket_type_id,attendee_name,short_code) values($1,$2,$3,$4,$5)',[t.order_id,event,type,'Synthetic',t.short_code])).rejects.toMatchObject({code:'23505'})
  })
  it('cancelar una solicitud pendiente libera la reserva de aforo',async()=>{
    await db.owner.query("update events set capacity=1,registration_mode='manual' where id=$1",[event])
    const c=await as();await register(c)
    expect((await register(c)).error).toBe('SOLD_OUT')
    const r=(await db.owner.query('select id from registrations where event_id=$1',[event])).rows[0]
    await (await as(admin)).query("select manage_registration($1,'cancel')",[r.id])
    expect((await register(c)).status).toBe('pending')
  })
  it('supresión revoca enlaces y elimina contenido personal sin borrar auditoría',async()=>{
    const result=await register(await as()),t=await entry(),a=await as(admin)
    await scan(await as(controller),t.short_code,true)
    await expect((await as(outsider)).query('select redact_registration($1)',[t.registration_id])).rejects.toMatchObject({message:'FORBIDDEN'})
    await a.query('select redact_registration($1)',[t.registration_id])
    expect((await a.query('select get_entry($1) data',[result.token])).rows[0].data).toBeNull()
    expect((await entry()).attendee_name).toBe('Datos suprimidos')
    expect((await db.owner.query('select email,phone from attendees where event_id=$1',[event])).rows[0].email).toContain('@deleted.invalid')
    expect((await db.owner.query('select count(*)::int n from access_logs where event_id=$1',[event])).rows[0].n).toBe(1)
  })
  it('solo el superadministrador con MFA autoriza identidades existentes',async()=>{
    const org=(await db.owner.query('select organization_id from events where id=$1',[event])).rows[0].organization_id
    await expect((await as(admin)).query("select assign_staff($1,$2,'controller',$3)",[outsider,org,event])).rejects.toMatchObject({message:'FORBIDDEN'})
    await db.owner.query('insert into admins(user_id) values($1)',[admin])
    const a=await as(admin)
    await a.query("select assign_staff($1,$2,'controller',$3)",[outsider,org,event])
    expect((await (await as(outsider)).query('select can_scan_event($1) allowed',[event])).rows[0].allowed).toBe(true)
    await a.query("select assign_staff($1,$2,'controller',$3,true)",[outsider,org,event])
    expect((await (await as(outsider)).query('select can_scan_event($1) allowed',[event])).rows[0].allowed).toBe(false)
  })
})

describe('acceso en dos pasos y auditoría',()=>{
  it('estadísticas globales solo están disponibles al superadministrador',async()=>{
    const a=await as(admin)
    expect((await a.query('select global_dashboard() data')).rows[0].data).toBeNull()
    await db.owner.query('insert into admins(user_id) values($1)',[admin])
    const global=(await a.query('select global_dashboard() data')).rows[0].data
    expect(global.issued).toBe((await db.owner.query('select count(*)::int n from tickets')).rows[0].n)
  })
  it('estadísticas cuentan solicitudes, anuladas y accesos desde la base de datos',async()=>{
    const c=await as(),a=await as(admin)
    await register(c);await register(c)
    const ts=(await db.owner.query('select id,short_code,registration_id from tickets where event_id=$1 order by created_at',[event])).rows
    await db.owner.query("update events set registration_mode='manual' where id=$1",[event]);await register(c)
    await scan(await as(controller),ts[0].short_code,true)
    await a.query("select manage_registration($1,'cancel')",[ts[1].registration_id])
    expect((await a.query('select event_dashboard($1) data',[event])).rows[0].data).toEqual({issued:2,used:1,valid:0,cancelled:1,pending:1,capacity:10,mode:'manual',item_name:'bonocopas',reservations:null})
    expect((await (await as(outsider)).query('select event_dashboard($1) data',[event])).rows[0].data).toBeNull()
  })
  it('un código ajeno no se busca fuera del evento seleccionado',async()=>{
    await register(await as());const t=await entry(),other=randomUUID(),org=(await db.owner.query('select organization_id from events where id=$1',[event])).rows[0].organization_id
    await db.owner.query("insert into events(id,slug,title,starts_at,published,organization_id) values($1::uuid,$1::text,'Other',now()+interval '1 day',true,$2)",[other,org])
    const r=await scan(await as(admin),t.short_code,true,other)
    expect(r).toEqual({result:'not_found'});expect((await entry()).status).toBe('valid')
  })
  it('evento cancelado bloquea acceso también mediante el RPC antiguo',async()=>{
    await register(await as());const t=await entry(),c=await as(controller)
    await db.owner.query("update events set status='cancelled' where id=$1",[event])
    expect((await scan(c,t.short_code,true)).result).toBe('event_closed')
    expect((await c.query('select validate_ticket($1,$2) data',[t.code,event])).rows[0].data.result).toBe('event_closed')
    expect((await entry()).status).toBe('valid')
  })
  it('buscar no consume; dos dispositivos confirman y solo uno entra',async()=>{
    await register(await as()); const t=await entry(), cs=await Promise.all([as(controller),as(controller)])
    expect((await scan(cs[0],t.short_code)).result).toBe('ready');expect((await entry()).status).toBe('valid')
    const result=await Promise.all(cs.map(c=>scan(c,t.short_code,true)))
    expect(result.map(r=>r.result).sort()).toEqual(['already_used','valid'])
    expect((await entry()).validated_by).toBe(controller)
    expect((await db.owner.query("select count(*)::int n from access_logs where event_id=$1 and result='valid'",[event])).rows[0].n).toBe(1)
  })
  it('rechaza anuladas, otro evento y usuario ajeno; audita rechazos',async()=>{
    await register(await as()); const t=await entry(), c=await as(controller)
    await expect(scan(await as(),t.short_code,true)).rejects.toMatchObject({code:'42501'})
    expect((await scan(await as(outsider),t.short_code,true)).result).toBe('forbidden')
    expect((await scan(c,t.short_code,true,randomUUID())).result).toBe('forbidden')
    await (await as(admin)).query("select manage_registration($1,'cancel')",[t.registration_id])
    expect((await scan(c,t.short_code,true)).result).toBe('cancelled')
    expect((await scan(c,'XXXX',true)).result).toBe('not_found')
    expect((await c.query('select * from access_logs')).rowCount).toBe(0)
    await expect((await as(admin)).query('delete from access_logs where event_id=$1',[event])).rejects.toMatchObject({code:'42501'})
  })
})
