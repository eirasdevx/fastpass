import 'server-only'
import type { Json } from '@/types/database'
import { DEMO_ADMIN_ID, DEMO_SESSION_COOKIE } from './mode'
import { getDemoDb, newTicketCode, type DemoDb } from './store'
import { purchaseSchema } from '@/lib/validations/purchase'
import { ticketCodeSchema } from '@/lib/security/inputs'

// Imitación mínima del cliente de Supabase para la versión beta: implementa solo
// lo que usa la app (select con relaciones y count, eq, gte, order, limit, single,
// insert, update, delete, rpc y auth) sobre los datos en memoria de store.ts.
// Las funciones RPC reproducen la lógica de supabase/migrations/0001_init.sql.

type Row = Record<string, unknown>
type TableName = keyof DemoDb
type PgError = { message: string; code?: string }
type Result = { data: unknown; error: PgError | null }

export type DemoCookies = {
  get: (name: string) => string | undefined
  set: (name: string, value: string) => void
  delete: (name: string) => void
}

type Relation = { table: TableName; kind: 'one' | 'many'; column: string }

// 'one': columna local que apunta al id de la otra tabla.
// 'many': columna de la otra tabla que apunta a este id.
const RELATIONS: Partial<Record<TableName, Partial<Record<TableName, Relation>>>> = {
  events: {
    ticket_types: { table: 'ticket_types', kind: 'many', column: 'event_id' },
    orders: { table: 'orders', kind: 'many', column: 'event_id' },
    tickets: { table: 'tickets', kind: 'many', column: 'event_id' },
  },
  ticket_templates: {
    ticket_types: { table: 'ticket_types', kind: 'many', column: 'template_id' },
  },
  ticket_types: {
    events: { table: 'events', kind: 'one', column: 'event_id' },
    ticket_templates: { table: 'ticket_templates', kind: 'one', column: 'template_id' },
    tickets: { table: 'tickets', kind: 'many', column: 'ticket_type_id' },
  },
  orders: {
    events: { table: 'events', kind: 'one', column: 'event_id' },
    tickets: { table: 'tickets', kind: 'many', column: 'order_id' },
  },
  tickets: {
    events: { table: 'events', kind: 'one', column: 'event_id' },
    orders: { table: 'orders', kind: 'one', column: 'order_id' },
    ticket_types: { table: 'ticket_types', kind: 'one', column: 'ticket_type_id' },
  },
}

const TIMESTAMPED: TableName[] = ['events', 'ticket_templates']

const DEFAULTS: Partial<Record<TableName, Row>> = {
  events: { description: '', venue: '', ends_at: null, cover_url: null, latitude: null, longitude: null, published: false },
  ticket_types: { description: '', price: 0, capacity: null, max_per_order: 10, template_id: null, sales_open: true },
  ticket_templates: { design: {}, description_template: '' },
}

function rows(db: DemoDb, table: TableName) {
  return db[table] as unknown as Row[]
}

/** Divide "a, b, rel(c, d)" por las comas de primer nivel. */
function splitTopLevel(columns: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of columns) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function project(db: DemoDb, table: TableName, row: Row, columns: string): Row {
  const out: Row = {}
  for (const part of splitTopLevel(columns)) {
    if (part === '*') {
      Object.assign(out, row)
      continue
    }
    const match = part.match(/^(\w+)\(([\s\S]*)\)$/)
    if (!match) {
      out[part] = row[part]
      continue
    }
    const [, name, inner] = match
    const rel = RELATIONS[table]?.[name as TableName]
    if (!rel) throw new Error(`[demo] relación no soportada: ${table}.${name}`)

    if (rel.kind === 'one') {
      const target = rows(db, rel.table).find((r) => r.id === row[rel.column])
      out[name] = target ? project(db, rel.table, target, inner) : null
    } else {
      const related = rows(db, rel.table).filter((r) => r[rel.column] === row.id)
      out[name] =
        inner.trim() === 'count'
          ? [{ count: related.length }]
          : related.map((r) => project(db, rel.table, r, inner))
    }
  }
  return out
}

function compare(a: unknown, b: unknown) {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'es')
}

class DemoQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private columns = '*'
  private returning = false
  private values: Row[] = []
  private patch: Row = {}
  private filters: ((row: Row) => boolean)[] = []
  private sorts: { column: string; ascending: boolean }[] = []
  private max: number | null = null
  private mode: 'many' | 'single' | 'maybeSingle' = 'many'

  constructor(
    private db: DemoDb,
    private table: TableName
  ) {}

  select(columns = '*') {
    this.columns = columns
    if (this.op !== 'select') this.returning = true
    return this
  }
  insert(values: Row | Row[]) {
    this.op = 'insert'
    this.values = Array.isArray(values) ? values : [values]
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.patch = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  gte(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) >= 0)
    return this
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.sorts.push({ column, ascending: options.ascending ?? true })
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  single() {
    this.mode = 'single'
    return this
  }
  maybeSingle() {
    this.mode = 'maybeSingle'
    return this
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected)
  }

  private matching() {
    return rows(this.db, this.table).filter((row) => this.filters.every((f) => f(row)))
  }

  private execute(): Result {
    let result: Row[]
    switch (this.op) {
      case 'select':
        result = this.matching()
        break
      case 'insert':
        result = this.runInsert()
        break
      case 'update': {
        const error = this.validateUpdate()
        if (error) return fail(error)
        result = this.runUpdate()
        break
      }
      case 'delete': {
        const error = this.runDelete()
        if (error) return { data: null, error }
        result = []
        break
      }
    }

    if (this.op !== 'select' && !this.returning) return { data: null, error: null }

    for (const { column, ascending } of [...this.sorts].reverse()) {
      result = [...result].sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1))
    }
    if (this.max !== null) result = result.slice(0, this.max)

    // Copias: quien lee no puede modificar el almacén por accidente
    const data = structuredClone(result.map((row) => project(this.db, this.table, row, this.columns)))

    if (this.mode === 'many') return { data, error: null }
    if (data.length > 1 || (data.length === 0 && this.mode === 'single')) {
      return {
        data: null,
        error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
      }
    }
    return { data: data[0] ?? null, error: null }
  }

  private runInsert() {
    const now = new Date().toISOString()
    const inserted = this.values.map((values) => ({
      id: crypto.randomUUID(),
      created_at: now,
      ...(TIMESTAMPED.includes(this.table) ? { updated_at: now } : {}),
      ...DEFAULTS[this.table],
      ...structuredClone(values),
    }))
    rows(this.db, this.table).push(...inserted)
    return inserted
  }

  private runUpdate() {
    const now = new Date().toISOString()
    const matched = this.matching()
    for (const row of matched) {
      Object.assign(row, structuredClone(this.patch))
      if (this.table === 'tickets' && 'status' in this.patch) {
        row.used_at = row.status === 'used' ? now : null
        row.validated_by = row.status === 'used' ? DEMO_ADMIN_ID : null
      }
      if (TIMESTAMPED.includes(this.table)) row.updated_at = now
    }
    return matched
  }

  private validateUpdate(): string | null {
    const matchingIds = new Set(this.matching().map((row) => row.id))
    const tickets = this.db.tickets.map((ticket) => this.table === 'tickets' && matchingIds.has(ticket.id)
      ? { ...ticket, ...this.patch } : ticket)
    if (tickets.some((ticket) => !['valid', 'used', 'cancelled'].includes(ticket.status))) return 'INVALID_INPUT'
    for (const event of this.db.events) {
      const capacity = this.table === 'events' && matchingIds.has(event.id) && 'capacity' in this.patch ? this.patch.capacity : event.capacity
      if (typeof capacity === 'number' && tickets.filter((ticket) => ticket.event_id === event.id && ticket.status !== 'cancelled').length > capacity) return 'SOLD_OUT'
    }
    for (const type of this.db.ticket_types) {
      const capacity = this.table === 'ticket_types' && matchingIds.has(type.id) && 'capacity' in this.patch ? this.patch.capacity : type.capacity
      if (typeof capacity === 'number' && tickets.filter((ticket) => ticket.ticket_type_id === type.id && ticket.status !== 'cancelled').length > capacity) return 'SOLD_OUT'
    }
    return null
  }

  private runDelete(): PgError | null {
    const ids = new Set(this.matching().map((row) => row.id))
    const db = this.db

    if (this.table === 'ticket_types' && db.tickets.some((t) => ids.has(t.ticket_type_id))) {
      return { message: 'violates foreign key constraint "tickets_ticket_type_id_fkey"', code: '23503' }
    }
    if (this.table === 'events') {
      db.tickets = db.tickets.filter((t) => !ids.has(t.event_id))
      db.orders = db.orders.filter((o) => !ids.has(o.event_id))
      db.ticket_types = db.ticket_types.filter((t) => !ids.has(t.event_id))
    }
    if (this.table === 'orders') {
      db.tickets = db.tickets.filter((t) => !ids.has(t.order_id))
    }
    if (this.table === 'ticket_templates') {
      for (const type of db.ticket_types) {
        if (type.template_id && ids.has(type.template_id)) type.template_id = null
      }
    }
    ;(db as unknown as Record<TableName, Row[]>)[this.table] = rows(db, this.table).filter((row) => !ids.has(row.id))
    return null
  }
}

// --- RPC ----------------------------------------------------------------------------

function fail(message: string): Result {
  return { data: null, error: { message } }
}

function eventTicketStats(db: DemoDb, args: { p_event_id: string }): Result {
  const data = db.ticket_types
    .filter((type) => type.event_id === args.p_event_id)
    .map((type) => {
      const tickets = db.tickets.filter((t) => t.ticket_type_id === type.id)
      return {
        ticket_type_id: type.id,
        sold: tickets.filter((t) => t.status !== 'cancelled').length,
        used: tickets.filter((t) => t.status === 'used').length,
      }
    })
  return { data, error: null }
}

function purchaseTickets(
  db: DemoDb,
  args: { p_event_id: string; p_buyer_name: string; p_buyer_email: string; p_items: Json; p_request_id?: string }
): Result {
  const input = purchaseSchema.safeParse({ buyer_name: args.p_buyer_name, buyer_email: args.p_buyer_email, items: args.p_items, request_id: args.p_request_id })
  if (!input.success) return fail('INVALID_INPUT')
  const name = (args.p_buyer_name ?? '').trim()
  const email = (args.p_buyer_email ?? '').trim().toLowerCase()
  if (!name || name.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('Nombre o email no válidos')
  }

  const event = db.events.find((e) => e.id === args.p_event_id && e.published)
  if (!event) return fail('El evento no está disponible')
  if (new Date(event.ends_at ?? event.starts_at).getTime() < Date.now()) return fail('El evento ya ha terminado')
  if (!Array.isArray(args.p_items)) return fail('Selección de entradas no válida')

  const items = args.p_items as { ticket_type_id: string; quantity: number }[]
  const fingerprint = JSON.stringify({ name, email, event: args.p_event_id, items: [...items].sort((a, b) => a.ticket_type_id.localeCompare(b.ticket_type_id)) })
  if (args.p_request_id) {
    const previous = db.orders.find((order) => order.request_id === args.p_request_id)
    if (previous) return previous.request_payload === fingerprint ? { data: previous.access_token, error: null } : fail('IDEMPOTENCY_CONFLICT')
  }
  const newTickets: DemoDb['tickets'] = []
  const orderId = crypto.randomUUID()
  const token = crypto.randomUUID()
  const now = new Date().toISOString()

  // Se comprueba todo antes de guardar nada, como hace la transacción en SQL
  for (const item of items) {
    const qty = Number(item.quantity) || 0
    if (qty <= 0) continue

    const type = db.ticket_types.find((t) => t.id === item.ticket_type_id && t.event_id === event.id)
    if (!type) return fail('Tipo de entrada no válido')
    if (!type.sales_open) return fail(`La venta de "${type.name}" está cerrada`)
    if (qty > type.max_per_order) return fail(`Máximo ${type.max_per_order} entradas de "${type.name}" por pedido`)

    if (type.capacity !== null) {
      const sold = db.tickets.filter((t) => t.ticket_type_id === type.id && t.status !== 'cancelled').length
      if (sold + qty > type.capacity) {
        return fail(
          `No quedan suficientes entradas de "${type.name}" (disponibles: ${Math.max(type.capacity - sold, 0)})`
        )
      }
    }

    for (let i = 0; i < qty; i++) {
      newTickets.push({
        id: crypto.randomUUID(),
        code: newTicketCode(),
        order_id: orderId,
        event_id: event.id,
        ticket_type_id: type.id,
        attendee_name: name,
        status: 'valid',
        used_at: null,
        validated_by: null,
        created_at: now,
      })
    }
  }

  if (newTickets.length === 0) return fail('Selecciona al menos una entrada')
  if (event.capacity != null && db.tickets.filter((ticket) => ticket.event_id === event.id && ticket.status !== 'cancelled').length + newTickets.length > event.capacity) return fail('SOLD_OUT')

  db.orders.push({
    id: orderId,
    event_id: event.id,
    buyer_name: name,
    buyer_email: email,
    access_token: token,
    request_id: args.p_request_id,
    request_payload: fingerprint,
    created_at: now,
  })
  db.tickets.push(...newTickets)
  return { data: token, error: null }
}

function getOrder(db: DemoDb, args: { p_token: string }): Result {
  const order = db.orders.find((o) => o.access_token === args.p_token)
  const event = order && db.events.find((e) => e.id === order.event_id)
  if (!order || !event) return { data: null, error: null }

  const tickets = db.tickets
    .filter((t) => t.order_id === order.id)
    .map((t) => {
      const type = db.ticket_types.find((tt) => tt.id === t.ticket_type_id)!
      const template = db.ticket_templates.find((tpl) => tpl.id === type.template_id)
      return {
        code: t.code,
        status: t.status,
        used_at: t.used_at,
        attendee_name: t.attendee_name,
        type_name: type.name,
        type_description: type.description,
        price: type.price,
        design: template?.design ?? null,
        description_template: template?.description_template ?? null,
        created_at: t.created_at,
      }
    })
    .sort((a, b) => compare(a.type_name, b.type_name) || compare(a.created_at, b.created_at))

  return {
    data: structuredClone({
      buyer_name: order.buyer_name,
      created_at: order.created_at,
      event: {
        title: event.title,
        slug: event.slug,
        venue: event.venue,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
      },
      tickets,
    }),
    error: null,
  }
}

function validateTicket(db: DemoDb, args: { p_code: string; p_event_id?: string }, userId: string | null): Result {
  if (!userId) return { data: null, error: { message: 'No autorizado', code: '42501' } }

  const parsed = ticketCodeSchema.safeParse(args.p_code)
  if (!parsed.success) return { data: { result: 'not_found', code: '' }, error: null }
  const code = parsed.data
  const ticket = db.tickets.find((t) => t.code === code)
  if (!ticket) return { data: { result: 'not_found', code }, error: null }

  const event = db.events.find((e) => e.id === ticket.event_id)!
  const type = db.ticket_types.find((t) => t.id === ticket.ticket_type_id)!
  const info = {
    code: ticket.code,
    attendee_name: ticket.attendee_name,
    event_title: event.title,
    starts_at: event.starts_at,
    type_name: type.name,
    used_at: ticket.used_at,
  }

  if (args.p_event_id && ticket.event_id !== args.p_event_id) return { data: { code, result: 'wrong_event' }, error: null }
  if (ticket.status === 'cancelled') return { data: { ...info, result: 'cancelled' }, error: null }
  if (ticket.status === 'used') return { data: { ...info, result: 'already_used' }, error: null }

  const now = new Date().toISOString()
  ticket.status = 'used'
  ticket.used_at = now
  ticket.validated_by = userId
  return { data: { ...info, result: 'valid', used_at: now }, error: null }
}

// --- Cliente ------------------------------------------------------------------------

export function createDemoClient(cookies: DemoCookies) {
  const db = getDemoDb()

  const currentUser = () => {
    const email = cookies.get(DEMO_SESSION_COOKIE)
    return email ? { id: DEMO_ADMIN_ID, email } : null
  }

  return {
    from: (table: TableName) => new DemoQuery(db, table),

    rpc: async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
      switch (name) {
        case 'event_ticket_stats':
          return eventTicketStats(db, args as Parameters<typeof eventTicketStats>[1])
        case 'purchase_tickets':
          return purchaseTickets(db, args as Parameters<typeof purchaseTickets>[1])
        case 'get_order':
          return getOrder(db, args as Parameters<typeof getOrder>[1])
        case 'validate_ticket':
          return validateTicket(db, args as Parameters<typeof validateTicket>[1], currentUser()?.id ?? null)
        case 'is_admin':
          return { data: currentUser() !== null, error: null }
        default:
          return fail(`[demo] función no soportada: ${name}`)
      }
    },

    auth: {
      getUser: async () => ({ data: { user: currentUser() }, error: null }),

      // En la beta vale cualquier email y contraseña
      signInWithPassword: async ({ email }: { email: string; password: string }) => {
        cookies.set(DEMO_SESSION_COOKIE, email)
        return { data: { user: { id: DEMO_ADMIN_ID, email } }, error: null }
      },

      signOut: async () => {
        cookies.delete(DEMO_SESSION_COOKIE)
        return { error: null }
      },
    },
  }
}
