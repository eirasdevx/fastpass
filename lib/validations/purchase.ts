import { z } from 'zod'

export const purchaseSchema = z.object({
  buyer_name: z.string().trim().min(2, 'Escribe tu nombre').max(120),
  buyer_email: z.email('Email no válido').max(254),
  request_id: z.uuid().optional(),
  items: z
    .array(
      z.object({
        ticket_type_id: z.uuid(),
        quantity: z.number().int().min(0).max(50),
      })
    )
    .min(1).max(50)
    .refine((items) => new Set(items.map((i) => i.ticket_type_id.toLowerCase())).size === items.length, 'Tipos de entrada repetidos')
    .refine((items) => items.reduce((n, i) => n + i.quantity, 0) <= 50, 'Máximo 50 entradas por pedido')
    .refine((items) => items.some((i) => i.quantity > 0), 'Selecciona al menos una entrada'),
})

export type PurchaseInput = z.infer<typeof purchaseSchema>
