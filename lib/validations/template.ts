import { z } from 'zod'
import { ticketDesignSchema } from '@/lib/tickets/design'
import { blockDesignSchema } from '@/lib/tickets/blocks'

/** Formato antiguo de diseños fijos (se sigue pudiendo editar). */
export const legacyTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre').max(80),
  description_template: z.string().max(1000, 'Máximo 1000 caracteres'),
  design: ticketDesignSchema,
})
export type LegacyTemplateInput = z.infer<typeof legacyTemplateSchema>

export const templateSchema = legacyTemplateSchema.extend({
  // Plantilla por bloques (versión 2) o del formato antiguo.
  design: z.union([blockDesignSchema, ticketDesignSchema]),
})
export type TemplateInput = z.infer<typeof templateSchema>
