import { describe, expect, it, vi } from 'vitest'
import { purchaseSchema } from '@/lib/validations/purchase'
import { optionalImageUrl, safeAdminPath, ticketCodeSchema } from '@/lib/security/inputs'
import { publicError } from '@/lib/security/errors'
import { assertSafeEnvironment } from '@/lib/security/environment'
import { contentSecurityPolicy, securityHeaders } from '@/lib/security/headers'

vi.mock('server-only', () => ({}))
const { audit } = await import('@/lib/security/audit')

describe('fronteras de entrada y confidencialidad', () => {
  const base = {buyer_name:'Synthetic Buyer',buyer_email:'test@example.invalid'}
  const id='6d503584-e60b-4f55-940d-8582ca785704'
  it('rechaza tipos repetidos incluso cambiando mayúsculas', () => {
    expect(purchaseSchema.safeParse({...base,items:[{ticket_type_id:id,quantity:1},{ticket_type_id:id.toUpperCase(),quantity:1}]}).success).toBe(false)
  })
  it('acota número de líneas, total y longitud de email', () => {
    for(const input of [
      {...base,items:Array.from({length:51},()=>({ticket_type_id:crypto.randomUUID(),quantity:1}))},
      {...base,items:[{ticket_type_id:id,quantity:50},{ticket_type_id:crypto.randomUUID(),quantity:1}]},
      {...base,buyer_email:'x'.repeat(255)+'@example.invalid',items:[{ticket_type_id:id,quantity:1}]},
    ]) expect(purchaseSchema.safeParse(input).success).toBe(false)
  })
  it.each(['javascript:alert(1)','data:text/html,test','file:///etc/passwd','https://user:password@example.invalid/a'])('rechaza URL no apta para imágenes: %s', (url) => {
    expect(optionalImageUrl.safeParse(url).success).toBe(false)
  })
  it('admite imágenes HTTP(S) y vacío sin interpretar markup', () => {
    expect(optionalImageUrl.safeParse('https://example.invalid/a.png').success).toBe(true)
    expect(optionalImageUrl.safeParse('').success).toBe(true)
  })
  it('no elimina caracteres arbitrarios para hacer pasar un QR malformado', () => {
    expect(ticketCodeSchema.safeParse('A1B2-C3D4-E5F6-A7B8').success).toBe(true)
    expect(ticketCodeSchema.safeParse('A'.repeat(32)).success).toBe(true)
    expect(ticketCodeSchema.safeParse('Z'+'A'.repeat(16)).success).toBe(false)
    expect(ticketCodeSchema.safeParse('A'.repeat(100000)).success).toBe(false)
  })
  it('errores del proveedor no incluyen SQL, email o secretos en respuesta pública', () => {
    expect(publicError({message:'SQL details token=secret test@example.invalid'})).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
    expect(publicError({message:'SOLD_OUT'})).toBe('No quedan suficientes entradas.')
    expect(publicError({message:'SOLD_OUT secret'})).not.toContain('secret')
  })
  it('audit solo escribe categorías fijas sin identidad ni payload', () => {
    const spy=vi.spyOn(console,'warn').mockImplementation(()=>{})
    audit('access_denied')
    expect(spy).toHaveBeenCalledWith('{"category":"security","event":"access_denied"}')
    spy.mockRestore()
  })
  it.each(['//example.invalid','/admin\\example.invalid','/admin/../../outside','/administrator','/admin/%2f%2fevil'])('redirección de login restringida: %s', (value) => {
    expect(safeAdminPath(value)).toBe('/admin')
  })
  it('acepta rutas de administración internas', () => expect(safeAdminPath('/admin/validar')).toBe('/admin/validar'))
})

describe('cabeceras y guardia de producción', () => {
  it('cabeceras permiten cámara propia, bloquean framing y eliminan referrer', () => {
    const headers=Object.fromEntries(securityHeaders(true).map((header)=>[header.key,header.value]))
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Permissions-Policy']).toContain('camera=(self)')
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000')
  })
  it('CSP utiliza nonce y no permite eval JavaScript en producción', () => {
    const csp=contentSecurityPolicy('unique-nonce',false)
    expect(csp).toContain("'nonce-unique-nonce'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("'wasm-unsafe-eval'")
    expect(csp).toContain("connect-src 'self';")
  })
  it('CSP solo añade el origen de Supabase (sin rutas ni otros dominios)', () => {
    expect(contentSecurityPolicy('n',false,'https://abc.supabase.co/rest/v1')).toContain("connect-src 'self' https://abc.supabase.co;")
    expect(contentSecurityPolicy('n',false,'no es una url')).toContain("connect-src 'self';")
  })
  it('la guardia rechaza demo en producción sin mostrar configuración sensible', () => {
    expect(()=>assertSafeEnvironment({NODE_ENV:'production',NEXT_PUBLIC_DEMO_MODE:'true'})).toThrow('El modo demo solo está permitido')
    expect(()=>assertSafeEnvironment({NODE_ENV:'development',NEXT_PUBLIC_DEMO_MODE:'true'})).not.toThrow()
    expect(()=>assertSafeEnvironment({NODE_ENV:'production',NEXT_PUBLIC_DEMO_MODE:'false'})).not.toThrow()
  })
})
