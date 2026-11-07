import { beforeEach, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({identity:vi.fn(),listFactors:vi.fn(),enroll:vi.fn(),unenroll:vi.fn(),verify:vi.fn(),rpc:vi.fn(),audit:vi.fn()}))
vi.mock('@/lib/security/staff',()=>({staffIdentity:mocks.identity}))
vi.mock('@/lib/security/audit',()=>({audit:mocks.audit}))
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw new Error('redirect:'+path)}}))
const {prepareMfa,verifyMfa}=await import('@/app/(public)/login/mfa/actions')
const factor='b36f9326-b412-47a7-b230-c7e1aa3ac878'
beforeEach(()=>{
  vi.resetAllMocks()
  mocks.identity.mockResolvedValue({user:{id:'synthetic'},supabase:{auth:{mfa:{listFactors:mocks.listFactors,enroll:mocks.enroll,unenroll:mocks.unenroll,challengeAndVerify:mocks.verify}},rpc:mocks.rpc}})
})
it('sin identidad autorizada no puede iniciar MFA',async()=>{
  mocks.identity.mockResolvedValue(null)
  expect((await prepareMfa())?.error).toBeDefined()
  expect(mocks.enroll).not.toHaveBeenCalled()
})
it('reutiliza el factor verificado sin generar ni divulgar su secreto',async()=>{
  mocks.listFactors.mockResolvedValue({data:{totp:[{id:factor,status:'verified'}],all:[]},error:null})
  expect(await prepareMfa()).toEqual({factorId:factor})
  expect(mocks.enroll).not.toHaveBeenCalled()
})
it('no verifica un factor que no pertenece a la cuenta autenticada',async()=>{
  mocks.listFactors.mockResolvedValue({data:{all:[]},error:null})
  const form=new FormData();form.set('factorId',factor);form.set('code','123456')
  expect((await verifyMfa(undefined,form))?.error).toBe('Verificación no válida.')
  expect(mocks.verify).not.toHaveBeenCalled()
  expect(mocks.audit).toHaveBeenCalledWith('mfa_failed')
})
it('requiere AAL2 confirmado por el servidor tras el desafío',async()=>{
  mocks.listFactors.mockResolvedValue({data:{all:[{id:factor,factor_type:'totp'}]},error:null})
  mocks.verify.mockResolvedValue({error:null})
  mocks.rpc.mockResolvedValue({data:null,error:null})
  const form=new FormData();form.set('factorId',factor);form.set('code','123456')
  expect((await verifyMfa(undefined,form))?.error).toBe('No autorizado.')
  expect(mocks.rpc).toHaveBeenCalledWith('staff_role')
})
