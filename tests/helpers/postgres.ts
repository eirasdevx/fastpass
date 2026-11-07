import EmbeddedPostgres from 'embedded-postgres'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile, rm } from 'node:fs/promises'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import net from 'node:net'

export async function testDatabase(beforeRegistrationMigration?: (owner: Client) => Promise<void>) {
  // Deliberately never accepts a URL or any production credentials/environment variables.
  let root = path.resolve('.security-test-db')
  await mkdir(root, { recursive: true })
  if (process.platform === 'win32') {
    // initdb on Windows needs an ASCII path when the profile name has accents.
    // Fixed read-only command; no path/user input interpolated into shell code.
    const short = execFileSync('cmd.exe', ['/d', '/c', 'for %I in (.) do @echo %~sI'], { cwd: root, windowsHide: true, encoding: 'utf8' }).trim()
    if ((await realpath(short)).toLowerCase() !== (await realpath(root)).toLowerCase()) throw new Error('Unexpected test path')
    root = short
  }
  const databaseDir = path.resolve(root, randomUUID())
  if (!databaseDir.startsWith(root + path.sep)) throw new Error('Unsafe test directory')
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
  })
  const password = randomUUID()
  const options = {
    databaseDir, port, user: 'postgres', password, persistent: false,
    authMethod: 'scram-sha-256' as const,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-c', 'max_connections=40', '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic'],
    onLog: () => {}, onError: () => {},
  }
  let embedded: Pick<EmbeddedPostgres, 'initialise' | 'start' | 'stop'>
  if (process.platform === 'win32') {
    const workspace = execFileSync('cmd.exe', ['/d','/c','for %I in (.) do @echo %~sI'], {windowsHide:true,encoding:'utf8'}).trim()
    if ((await realpath(workspace)).toLowerCase() !== (await realpath(process.cwd())).toLowerCase()) throw new Error('Unexpected binary path')
    const bin = path.join(workspace,'node_modules/@embedded-postgres/windows-x64/native/bin')
    const run = promisify(execFile)
    const passwordFile = path.join(root, randomUUID() + '.tmp')
    let running = false
    embedded = {
      async initialise() {
        await writeFile(passwordFile, password + '\n', { mode: 0o600 })
        try {
          await run(path.join(bin,'initdb.exe'), ['-D',databaseDir,'-U','postgres','--auth=scram-sha-256',`--pwfile=${passwordFile}`,'--encoding=UTF8','--locale=C','--no-sync'], {windowsHide:true,timeout:30000})
        } finally { await rm(passwordFile, {force:true}) }
      },
      async start() {
        await run(path.join(bin,'pg_ctl.exe'), ['-D',databaseDir,'-l',path.join(databaseDir,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c max_connections=40 -c log_statement=none -c log_min_error_statement=panic`,'-w','start'], {windowsHide:true,timeout:30000})
        running = true
      },
      async stop() {
        if (running) await run(path.join(bin,'pg_ctl.exe'), ['-D',databaseDir,'-m','fast','-w','stop'], {windowsHide:true,timeout:30000})
        // This exact directory was generated above; never remove the root or a supplied path.
        if (!path.resolve(databaseDir).startsWith(path.resolve(root) + path.sep)) throw new Error('Unsafe cleanup path')
        await rm(databaseDir, {recursive:true,force:true})
      },
    }
  } else {
    embedded = new EmbeddedPostgres(options)
  }
  await embedded.initialise()
  await embedded.start()
  const clients = new Set<Client>()
  async function connect(user?: string, aal = 'aal2') {
    const client = new Client({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres',
      connectionTimeoutMillis: 5000, statement_timeout: 10000 })
    await client.connect()
    clients.add(client)
    if (user !== undefined) {
      await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user || null, aal })])
      await client.query(user ? 'set role authenticated' : 'set role anon')
    }
    return client
  }
  const owner = await connect()
  try {
    await owner.query(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;
      grant execute on all functions in schema auth to anon,authenticated;
    `)
    for (const file of ['0001_init.sql', '0002_security.sql', '0003_sales_gate.sql', '0004_registration.sql', '0005_organizer_signup.sql', '0006_table_grants.sql', '0007_event_owner_read.sql', '0008_reservations.sql', '0009_reservation_admin.sql', '0010_pickup_item_name.sql', '0011_reservation_attendees.sql', '0012_personal_data_purge.sql', '0013_reservation_people.sql', '0014_attendees_with_ticket.sql', '0015_last_pickup.sql', '0016_team_and_history.sql', '0017_launch_capacity.sql', '0018_delete_own_account.sql', '0019_event_location_and_covers.sql', '0020_security_hardening.sql']) {
      if (file === '0004_registration.sql') await beforeRegistrationMigration?.(owner)
      await owner.query(await readFile(path.join('supabase/migrations', file), 'utf8'))
    }
  } catch (error) {
    await owner.end()
    await embedded.stop()
    throw error
  }
  return {
    owner, connect,
    async stop() {
      await Promise.all([...clients].map((client) => client.end()))
      await embedded.stop()
    },
  }
}
