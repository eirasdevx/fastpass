import { z } from 'zod'
import { optionalImageUrl } from '@/lib/security/inputs'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal (#RRGGBB)')
const optionalUrl = optionalImageUrl

export const LAYOUTS = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  minimal: 'Minimalista',
} as const

export const FONTS = {
  sans: { label: 'Moderna', css: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif' },
  serif: { label: 'Clásica', css: 'Georgia, Cambria, "Times New Roman", serif' },
  mono: { label: 'Técnica', css: 'var(--font-geist-mono), ui-monospace, monospace' },
  display: { label: 'Cartel', css: 'Impact, "Arial Narrow Bold", "Helvetica Neue", sans-serif' },
} as const

export const ticketDesignSchema = z.object({
  layout: z.enum(['horizontal', 'vertical', 'minimal']),
  font: z.enum(['sans', 'serif', 'mono', 'display']),
  backgroundColor: hex,
  textColor: hex,
  accentColor: hex,
  backgroundImageUrl: optionalUrl,
  logoUrl: optionalUrl,
  overlayOpacity: z.number().int().min(0).max(90),
  radius: z.number().int().min(0).max(40),
  headline: z.string().max(40),
  footerText: z.string().max(200),
  showDate: z.boolean(),
  showVenue: z.boolean(),
  showPrice: z.boolean(),
  showAttendee: z.boolean(),
  showCode: z.boolean(),
})

export type TicketDesign = z.infer<typeof ticketDesignSchema>

export const DEFAULT_DESIGN: TicketDesign = {
  layout: 'horizontal',
  font: 'sans',
  backgroundColor: '#111827',
  textColor: '#F9FAFB',
  accentColor: '#F59E0B',
  backgroundImageUrl: '',
  logoUrl: '',
  overlayOpacity: 40,
  radius: 16,
  headline: 'ENTRADA',
  footerText: 'Presenta este QR en la puerta. Entrada personal e intransferible.',
  showDate: true,
  showVenue: true,
  showPrice: true,
  showAttendee: true,
  showCode: true,
}

/** Lee el jsonb guardado en BD y lo completa con los valores por defecto. */
export function parseDesign(value: unknown): TicketDesign {
  const merged = { ...DEFAULT_DESIGN, ...(typeof value === 'object' && value ? value : {}) }
  const parsed = ticketDesignSchema.safeParse(merged)
  return parsed.success ? parsed.data : DEFAULT_DESIGN
}

// --- Variables de la descripción ----------------------------------------------

export const PLACEHOLDERS = {
  evento: 'Nombre del evento',
  fecha: 'Fecha del evento',
  hora: 'Hora de inicio',
  lugar: 'Lugar',
  tipo: 'Tipo de entrada',
  descripcion_tipo: 'Descripción del tipo de entrada',
  precio: 'Precio',
  asistente: 'Nombre del asistente',
  codigo: 'Código de la entrada',
} as const

export type PlaceholderKey = keyof typeof PLACEHOLDERS
export type TicketVariables = Record<PlaceholderKey, string>

/** Sustituye {{variable}} por su valor. Las variables desconocidas se dejan tal cual. */
export function renderDescription(template: string, vars: TicketVariables) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key as PlaceholderKey] : match
  )
}
