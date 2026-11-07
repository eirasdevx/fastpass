import { z } from 'zod'

export const optionalImageUrl = z.union([
  z.literal(''),
  z.url('URL no válida').max(2048).refine((value) => {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  }, 'Utiliza una URL HTTP o HTTPS sin credenciales'),
])
export const ticketCodeSchema = z.string().trim().max(64)
  .regex(/^[0-9a-fA-F -]+$/)
  .transform((value) => value.replace(/[ -]/g, '').toUpperCase())
  .refine((value) => value.length === 16 || value.length === 32)

export function safeAdminPath(value?: string) {
  if (!value || !/^\/admin(?:\/|$)/.test(value) || /[\\\s%?#]/.test(value)) return '/admin'
  const url = new URL(value, 'https://fastpass.invalid')
  return url.pathname === '/admin' || url.pathname.startsWith('/admin/') ? url.pathname : '/admin'
}
