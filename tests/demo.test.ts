import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createDemoClient } = await import('@/lib/demo/client')
const { DEMO_ORDER_TOKEN, DEMO_SESSION_COOKIE } = await import('@/lib/demo/mode')

function client(session?: string) {
  const jar = new Map<string, string>(session ? [[DEMO_SESSION_COOKIE, session]] : [])
  return {
    jar,
    supabase: createDemoClient({
      get: (name) => jar.get(name),
      set: (name, value) => void jar.set(name, value),
      delete: (name) => void jar.delete(name),
    }),
  }
}

type Row = Record<string, unknown>

beforeEach(() => {
  // Datos de ejemplo nuevos en cada test
  delete (globalThis as { __fastpassDemoDb?: unknown }).__fastpassDemoDb
})

describe('versión beta (datos en memoria)', () => {
  it('rechaza líneas duplicadas antes de modificar inventario demo', async () => {
    const { supabase }=client()
    const list=await supabase.from('ticket_types').select('id, event_id').limit(1).single()
    const type=list.data as {id:string;event_id:string}
    const before=await supabase.from('tickets').select('id')
    const result=await supabase.rpc('purchase_tickets',{p_event_id:type.event_id,p_buyer_name:'Test Buyer',p_buyer_email:'test@example.invalid',p_items:[{ticket_type_id:type.id,quantity:1},{ticket_type_id:type.id,quantity:1}]})
    expect(result.error?.message).toBe('INVALID_INPUT')
    expect((await supabase.from('tickets').select('id')).data).toEqual(before.data)
  })
  it('demo también impide reactivar una entrada cuando el cupo ya se ha ocupado', async () => {
    const { supabase }=client('demo@example.invalid')
    const order=await supabase.rpc('get_order',{p_token:DEMO_ORDER_TOKEN})
    const code=(order.data as {tickets:{code:string}[]}).tickets[0].code
    const entry=(await supabase.from('tickets').select('id, ticket_type_id, event_id').eq('code',code).single()).data as {id:string;ticket_type_id:string;event_id:string}
    const issued=(await supabase.from('tickets').select('status').eq('ticket_type_id',entry.ticket_type_id)).data as {status:string}[]
    const count=issued.filter((t)=>t.status!=='cancelled').length
    await supabase.from('ticket_types').update({capacity:count}).eq('id',entry.ticket_type_id)
    await supabase.from('tickets').update({status:'cancelled'}).eq('id',entry.id)
    const result=await supabase.rpc('purchase_tickets',{p_event_id:entry.event_id,p_buyer_name:'Test Buyer',p_buyer_email:'test@example.invalid',p_items:[{ticket_type_id:entry.ticket_type_id,quantity:1}]})
    expect(result.error).toBeNull()
    expect((await supabase.from('tickets').update({status:'valid'}).eq('id',entry.id)).error?.message).toBe('SOLD_OUT')
  })
  it('lista eventos publicados con filtros, orden y relaciones', async () => {
    const { supabase } = client()
    const { data } = await supabase
      .from('events')
      .select('id, title, starts_at, ticket_types(name, price)')
      .eq('published', true)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
    const events = data as (Row & { ticket_types: Row[] })[]

    expect(events.length).toBe(4)
    expect(events.map((e) => e.starts_at)).toEqual([...events.map((e) => e.starts_at)].sort())
    expect(events.every((e) => e.ticket_types.length > 0)).toBe(true)
  })

  it('compra entradas, respeta el aforo y el pedido se puede consultar', async () => {
    const { supabase } = client()
    const { data: event } = await supabase
      .from('events')
      .select('id, ticket_types(id, name)')
      .eq('slug', 'taller-de-ceramica-para-principiantes')
      .single()
    const { id: eventId, ticket_types } = event as { id: string; ticket_types: { id: string }[] }
    const buy = (quantity: number) =>
      supabase.rpc('purchase_tickets', {
        p_event_id: eventId,
        p_buyer_name: 'Ana Prueba',
        p_buyer_email: 'ana@ejemplo.com',
        p_items: [{ ticket_type_id: ticket_types[0].id, quantity }],
      })

    const ok = await buy(2) // quedaban 2 de 12
    expect(ok.error).toBeNull()

    const soldOut = await buy(1)
    expect(soldOut.error?.message).toMatch(/No quedan suficientes entradas/)

    const order = await supabase.rpc('get_order', { p_token: ok.data })
    expect((order.data as { tickets: unknown[] }).tickets).toHaveLength(2)
  })

  it('una entrada solo se valida una vez', async () => {
    const { supabase } = client('demo@fastpass.es')
    const order = await supabase.rpc('get_order', { p_token: DEMO_ORDER_TOKEN })
    const code = (order.data as { tickets: { code: string }[] }).tickets[0].code

    const first = await supabase.rpc('validate_ticket', { p_code: code })
    const second = await supabase.rpc('validate_ticket', { p_code: code })
    expect((first.data as Row).result).toBe('valid')
    expect((second.data as Row).result).toBe('already_used')
  })

  it('no deja borrar un tipo de entrada con entradas emitidas', async () => {
    const { supabase } = client('demo@fastpass.es')
    const { data: types } = await supabase.from('ticket_types').select('id, tickets(count)')
    const withTickets = (types as { id: string; tickets: { count: number }[] }[]).find((t) => t.tickets[0].count > 0)!

    const { error } = await supabase.from('ticket_types').delete().eq('id', withTickets.id)
    expect(error?.code).toBe('23503')
  })

  it('inicia y cierra sesión con cualquier email', async () => {
    const { supabase, jar } = client()
    expect((await supabase.auth.getUser()).data.user).toBeNull()

    await supabase.auth.signInWithPassword({ email: 'yo@ejemplo.com', password: 'x' })
    expect((await supabase.auth.getUser()).data.user?.email).toBe('yo@ejemplo.com')

    await supabase.auth.signOut()
    expect(jar.has(DEMO_SESSION_COOKIE)).toBe(false)
  })
})
