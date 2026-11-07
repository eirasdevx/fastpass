import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testDatabase } from './helpers/postgres'

let db: Awaited<ReturnType<typeof testDatabase>>
const alice = randomUUID(), bob = randomUUID(), colleague = randomUUID(), admin = randomUUID()
const orgA = randomUUID(), orgB = randomUUID(), event = randomUUID()
const object = () => `${alice}/${randomUUID()}.webp`

beforeAll(async () => {
  db = await testDatabase(async (owner) => {
    // Minimal Storage schema: exercise the real migration policies and PostgreSQL RLS.
    await owner.query(`
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      create function storage.foldername(text) returns text[] language sql immutable as
        $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,delete on storage.objects to authenticated;
    `)
  })
  await db.owner.query('insert into auth.users(id) values($1),($2),($3),($4)', [alice,bob,colleague,admin])
  await db.owner.query("insert into organizations values($1,'A'),($2,'B')", [orgA,orgB])
  await db.owner.query("insert into organization_members values($1,$4,'organizer'),($2,$5,'organizer'),($3,$4,'organizer')", [alice,bob,colleague,orgA,orgB])
  await db.owner.query('insert into admins(user_id) values($1)', [admin])
  await db.owner.query("insert into events(id,slug,title,starts_at,organization_id) values($1::uuid,$1::text,'Private draft',now(),$2)", [event,orgA])
}, 60000)
afterAll(async () => { if (db) await db.stop() }, 30000)

async function remove(user: string, name: string, aal = 'aal2') {
  const client = await db.connect(user, aal)
  try { return (await client.query("delete from storage.objects where bucket_id='event-covers' and name=$1", [name])).rowCount }
  finally { await client.end() }
}
async function upload(name: string) {
  await db.owner.query("insert into storage.objects(bucket_id,name) values('event-covers',$1)", [name])
}

describe('aislamiento de portadas mediante RLS', () => {
  it('otro organizador no borra una portada ajena aunque todavía no esté guardada en un evento', async () => {
    const name = object(); await upload(name)
    expect(await remove(bob, name)).toBe(0)
  })
  it('el propietario tampoco borra sin MFA', async () => {
    const name = object(); await upload(name)
    expect(await remove(alice, name, 'aal1')).toBe(0)
  })
  it('permite limpiar portadas propias, del mismo equipo y como superadministrador', async () => {
    for (const user of [alice, colleague, admin]) {
      const name = object(); await upload(name)
      expect(await remove(user, name)).toBe(1)
    }
  })
  it.each(['', '?v=2', '#preview'])('protege portadas en uso incluso con sufijo %s', async (suffix) => {
    const name = object(); await upload(name)
    await db.owner.query('update events set cover_url=$1 where id=$2', [`https://project.supabase.co/storage/v1/object/public/event-covers/${name}${suffix}`, event])
    expect(await remove(alice, name)).toBe(0)
    expect(await remove(admin, name)).toBe(0)
  })
})
