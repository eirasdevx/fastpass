import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TicketStatus } from '@/types/database'

const mocks=vi.hoisted(()=>({
  getAdmin:vi.fn(), canManageEvent:vi.fn(), createClient:vi.fn(), rpc:vi.fn(),
}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth',()=>({getAdmin:mocks.getAdmin,canManageEvent:mocks.canManageEvent}))
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.createClient}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('next/navigation',()=>({redirect:vi.fn(()=>{throw new Error('REDIRECT')})}))
const { setTicketStatus, saveTicketType, deleteEvent }=await import('@/app/admin/eventos/actions')
const { purchaseTickets }=await import('@/app/(public)/eventos/[slug]/actions')
const id='d5743e68-5c9a-41a8-ae8d-bfa9e60c2e6a'
const type={name:'General',description:'',price:10,capacity:10,max_per_order:5,template_id:null,sales_open:true}

beforeEach(()=>{
  vi.resetAllMocks()
  mocks.getAdmin.mockResolvedValue(null)
  mocks.canManageEvent.mockResolvedValue(false)
  mocks.createClient.mockResolvedValue({rpc:mocks.rpc})
})

describe('acciones del servidor: autorización antes de escribir',()=>{
  it('comprador sin permiso no modifica precio ni estado',async()=>{
    expect(await saveTicketType(id,id,type)).toEqual({error:'No autorizado'})
    expect(await setTicketStatus(id,id,'used')).toEqual({error:'No autorizado'})
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('organizador no modifica ni borra evento ajeno',async()=>{
    mocks.getAdmin.mockResolvedValue({id:crypto.randomUUID(),role:'organizer'})
    expect(await saveTicketType(id,id,type)).toEqual({error:'No autorizado'})
    expect(await deleteEvent(id)).toEqual({error:'No autorizado'})
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('status e identificadores TypeScript no eluden validación runtime',async()=>{
    mocks.getAdmin.mockResolvedValue({id:crypto.randomUUID(),role:'organizer'})
    expect(await setTicketStatus(id,id,'paid' as TicketStatus)).toEqual({error:'Datos inválidos'})
    expect(await deleteEvent('invalid')).toEqual({error:'Datos inválidos'})
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('compra inválida no alcanza el RPC',async()=>{
    const input={buyer_name:'Test Buyer',buyer_email:'test@example.invalid',items:[{ticket_type_id:id,quantity:1},{ticket_type_id:id,quantity:1}]}
    expect((await purchaseTickets(id,input)).error).toBeDefined()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('compra no refleja mensajes ni secretos del proveedor',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:'provider detail token=secret email=test@example.invalid'}})
    const result=await purchaseTickets(id,{buyer_name:'Test Buyer',buyer_email:'test@example.invalid',items:[{ticket_type_id:id,quantity:1}]})
    expect(result.error).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
  })
})
