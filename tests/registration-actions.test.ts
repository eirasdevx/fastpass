import { beforeEach,describe,it,expect,vi } from 'vitest'
import { csvCell } from '@/lib/csv'
import { entryCodeSchema,privateTokenSchema } from '@/lib/validations/registration'
const mocks=vi.hoisted(()=>({getAdmin:vi.fn(),getStaff:vi.fn(),createClient:vi.fn(),rpc:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth',()=>({getAdmin:mocks.getAdmin,getStaff:mocks.getStaff}))
vi.mock('@/lib/demo/mode',()=>({DEMO_MODE:false}))
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.createClient}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
const {registerAttendee}=await import('@/app/registro/actions')
const {manageRegistration}=await import('@/app/admin/asistentes/actions')
const {checkEntry}=await import('@/app/admin/accesos/actions')
const id='d5743e68-5c9a-41a8-ae8d-bfa9e60c2e6a'
const input={event:id,type:id,first:'Test',last:'Person',email:'test@example.invalid',phone:'',consent:true,website:'',approve:false,notes:''}
beforeEach(()=>{vi.resetAllMocks();mocks.createClient.mockResolvedValue({rpc:mocks.rpc});mocks.getAdmin.mockResolvedValue(null);mocks.getStaff.mockResolvedValue(null)})
describe('fronteras de acciones nuevas',()=>{
  it('anónimo no crea altas manuales, aprueba ni consulta códigos',async()=>{
    expect((await registerAttendee(input,true)).error).toBeDefined()
    expect((await manageRegistration(id,'approve')).error).toBeDefined()
    expect((await checkEntry(id,'A7K2')).error).toBeDefined()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('honeypot, consentimiento y estado público se comprueban en servidor',async()=>{
    for(const patch of [{website:'bot'},{consent:false},{approve:true},{notes:'forged'}])expect((await registerAttendee({...input,...patch})).error).toBeDefined()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('rechazo SQL no filtra diagnósticos',async()=>{
    mocks.rpc.mockResolvedValue({data:{error:'secret provider diagnostic'},error:null})
    expect((await registerAttendee(input)).error).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
  })
  it('búsqueda y confirmación envían intención y evento al servidor',async()=>{
    mocks.getStaff.mockResolvedValue({id});mocks.rpc.mockResolvedValue({data:{result:'ready'},error:null})
    await checkEntry(id,'a7k2');expect(mocks.rpc).toHaveBeenLastCalledWith('lookup_entry',{p_event:id,p_code:'A7K2',p_confirm:false})
    await checkEntry(id,'a7k2',true);expect(mocks.rpc).toHaveBeenLastCalledWith('lookup_entry',{p_event:id,p_code:'A7K2',p_confirm:true})
  })
  it('validación de tokens y códigos no confunde identificador corto con credencial',()=>{
    expect(entryCodeSchema.safeParse('A7K2').success).toBe(true)
    expect(privateTokenSchema.safeParse('A7K2').success).toBe(false)
    expect(entryCodeSchema.safeParse('a'.repeat(64)).success).toBe(false)
    expect(privateTokenSchema.safeParse('a'.repeat(64)).success).toBe(true)
  })
  it('CSV neutraliza fórmulas y escapa comillas y saltos',()=>{
    for(const value of ['=1+1','+cmd','-10','@SUM(A1)',' \t=cmd'])expect(csvCell(value)).toContain("'")
    expect(csvCell('Ana "Test"\nPerson')).toBe('"Ana ""Test""\nPerson"')
  })
})
