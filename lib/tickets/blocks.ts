import { z } from 'zod'
import { optionalImageUrl } from '@/lib/security/inputs'
import { FONTS, type TicketDesign } from '@/lib/tickets/design'

// Plantillas por bloques (versión 2). Una plantilla es un tema (colores, fuente, tamaño)
// y una lista de bloques que se pintan de arriba abajo. El mismo modelo sirve para la
// pantalla, la impresión y el correo (ver components/ticket/block-card.tsx).

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal (#RRGGBB)')
/** Colores de bloque: los del tema (texto, acento, atenuado) o uno propio. */
const color = z.union([z.enum(['text', 'accent', 'muted']), hex])
const align = z.enum(['left', 'center', 'right'])
const size = z.enum(['xs', 'sm', 'md', 'lg', 'xl', '2xl'])
const id = z.string().min(1).max(40)

const leafBlocks = [
  z.object({ id, type: z.literal('heading'), text: z.string().max(200), size, align, color, weight: z.enum(['normal', 'bold', 'black']), uppercase: z.boolean() }),
  z.object({ id, type: z.literal('text'), text: z.string().max(1000), size, align, color }),
  z.object({ id, type: z.literal('field'), label: z.string().max(60), value: z.string().max(300), align, color }),
  z.object({ id, type: z.literal('qr'), size: z.number().int().min(80).max(260), align, showCode: z.boolean() }),
  z.object({ id, type: z.literal('code'), size, align, color }),
  z.object({ id, type: z.literal('image'), url: optionalImageUrl, height: z.number().int().min(16).max(320), align }),
  z.object({ id, type: z.literal('divider'), style: z.enum(['solid', 'dashed', 'dotted']), color, thickness: z.number().int().min(1).max(8) }),
  z.object({ id, type: z.literal('spacer'), height: z.number().int().min(4).max(120) }),
  z.object({ id, type: z.literal('notice'), text: z.string().max(500), tone: z.enum(['warning', 'accent', 'neutral']) }),
] as const
export const leafBlockSchema = z.discriminatedUnion('type', leafBlocks)
export const columnsBlockSchema = z.object({
  id, type: z.literal('columns'), ratio: z.enum(['1:1', '2:1', '1:2']), valign: z.enum(['top', 'middle', 'bottom']),
  left: z.array(leafBlockSchema).max(20), right: z.array(leafBlockSchema).max(20),
})
export const blockSchema = z.discriminatedUnion('type', [...leafBlocks, columnsBlockSchema])

export const blockThemeSchema = z.object({
  font: z.enum(['sans', 'serif', 'mono', 'display']),
  backgroundColor: hex,
  textColor: hex,
  accentColor: hex,
  mutedColor: hex,
  backgroundImageUrl: optionalImageUrl,
  overlayOpacity: z.number().int().min(0).max(90),
  radius: z.number().int().min(0).max(40),
  padding: z.number().int().min(8).max(64),
  width: z.enum(['narrow', 'medium', 'wide']),
  borderColor: hex,
  borderWidth: z.number().int().min(0).max(8),
})

export const blockDesignSchema = z.object({
  version: z.literal(2),
  /** Para qué es: entrada digital o justificante de reserva con recogida. */
  kind: z.enum(['ticket', 'reservation']),
  theme: blockThemeSchema,
  blocks: z.array(blockSchema).max(40),
})

export type LeafBlock = z.infer<typeof leafBlockSchema>
export type ColumnsBlock = z.infer<typeof columnsBlockSchema>
export type Block = z.infer<typeof blockSchema>
export type BlockTheme = z.infer<typeof blockThemeSchema>
export type BlockDesign = z.infer<typeof blockDesignSchema>
export type TemplateKind = BlockDesign['kind']

export const WIDTHS = { narrow: { label: 'Estrecha (móvil)', px: 380 }, medium: { label: 'Media', px: 560 }, wide: { label: 'Ancha', px: 760 } } as const
export const SIZES = { xs: 11, sm: 13, md: 15, lg: 19, xl: 26, '2xl': 34 } as const
export const SIZE_LABELS = { xs: 'Muy pequeño', sm: 'Pequeño', md: 'Normal', lg: 'Grande', xl: 'Muy grande', '2xl': 'Enorme' } as const

export const BLOCK_LABELS: Record<Block['type'], string> = {
  heading: 'Título', text: 'Texto', field: 'Dato con etiqueta', qr: 'Código QR', code: 'Código de 4 caracteres',
  image: 'Imagen o logo', divider: 'Línea separadora', spacer: 'Espacio', notice: 'Aviso destacado', columns: 'Dos columnas',
}

// --- Variables ------------------------------------------------------------------------

export const VARIABLES: Record<TemplateKind, Record<string, string>> = {
  ticket: {
    evento: 'Nombre del evento', fecha: 'Fecha', hora: 'Hora', lugar: 'Lugar', tipo: 'Tipo de entrada',
    descripcion_tipo: 'Descripción del tipo', precio: 'Precio', asistente: 'Asistente', codigo: 'Código',
  },
  reservation: {
    evento: 'Nombre del evento', fecha: 'Fecha', hora: 'Hora', lugar: 'Lugar', tipo: 'Tipo', articulo: 'Qué se recoge',
    titular: 'Titular', codigo: 'Código de reserva', cantidad: 'Cantidad', precio: 'Precio unitario', total: 'Total',
    pendiente: 'A pagar al recoger', pagado: 'Ya pagado', estado: 'Estado', recogida_lugar: 'Punto de recogida',
    recogida_plazo: 'Plazo de recogida', recogida_instrucciones: 'Instrucciones', personas: 'Personas (una por línea)',
  },
}
export type TemplateVariables = Record<string, string>

/** Sustituye {{variable}} por su valor. Las desconocidas se dejan tal cual para que se note el error. */
export function fillVariables(text: string, vars: TemplateVariables) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => (key in vars ? vars[key] : match))
}

/** Aviso obligatorio de los justificantes: el dibujante lo añade siempre y no se puede quitar. */
export const RESERVATION_NOTICE = 'ESTE DOCUMENTO ES UN JUSTIFICANTE DE RESERVA. NO ES UNA ENTRADA DE ACCESO AL EVENTO.'

// --- Modelos de partida -----------------------------------------------------------------

const theme = (over: Partial<BlockTheme> = {}): BlockTheme => ({
  font: 'sans', backgroundColor: '#111827', textColor: '#F9FAFB', accentColor: '#F59E0B', mutedColor: '#9CA3AF',
  backgroundImageUrl: '', overlayOpacity: 40, radius: 16, padding: 28, width: 'medium', borderColor: '#F59E0B', borderWidth: 0, ...over,
})
let seq = 0
const bid = (prefix: string) => `${prefix}-${++seq}`

export function ticketPreset(): BlockDesign {
  return {
    version: 2, kind: 'ticket', theme: theme(),
    blocks: [
      { id: bid('h'), type: 'heading', text: 'ENTRADA', size: 'xs', align: 'left', color: 'accent', weight: 'bold', uppercase: true },
      { id: bid('h'), type: 'heading', text: '{{evento}}', size: 'xl', align: 'left', color: 'text', weight: 'black', uppercase: false },
      {
        id: bid('c'), type: 'columns', ratio: '2:1', valign: 'middle',
        left: [
          { id: bid('f'), type: 'field', label: 'Fecha', value: '{{fecha}} · {{hora}}', align: 'left', color: 'text' },
          { id: bid('f'), type: 'field', label: 'Lugar', value: '{{lugar}}', align: 'left', color: 'text' },
          { id: bid('f'), type: 'field', label: 'Tipo', value: '{{tipo}} · {{precio}}', align: 'left', color: 'accent' },
          { id: bid('f'), type: 'field', label: 'Asistente', value: '{{asistente}}', align: 'left', color: 'text' },
        ],
        right: [{ id: bid('q'), type: 'qr', size: 140, align: 'center', showCode: true }],
      },
      { id: bid('d'), type: 'divider', style: 'dashed', color: 'muted', thickness: 1 },
      { id: bid('t'), type: 'text', text: 'Presenta este QR en la puerta. Entrada personal e intransferible.', size: 'xs', align: 'left', color: 'muted' },
    ],
  }
}

export function reservationPreset(): BlockDesign {
  return {
    version: 2, kind: 'reservation',
    theme: theme({ backgroundColor: '#FFFFFF', textColor: '#111827', accentColor: '#B45309', mutedColor: '#6B7280', borderColor: '#E5E7EB', borderWidth: 1, width: 'medium' }),
    blocks: [
      { id: bid('h'), type: 'heading', text: 'Justificante de reserva', size: 'xs', align: 'left', color: 'muted', weight: 'bold', uppercase: true },
      { id: bid('h'), type: 'heading', text: '{{evento}}', size: 'xl', align: 'left', color: 'text', weight: 'black', uppercase: false },
      { id: bid('t'), type: 'text', text: '{{fecha}} · {{hora}} · {{lugar}}', size: 'sm', align: 'left', color: 'muted' },
      {
        id: bid('c'), type: 'columns', ratio: '2:1', valign: 'middle',
        left: [
          { id: bid('f'), type: 'field', label: 'Titular', value: '{{titular}}', align: 'left', color: 'text' },
          { id: bid('f'), type: 'field', label: 'Código de reserva', value: '', align: 'left', color: 'text' },
          { id: bid('k'), type: 'code', size: '2xl', align: 'left', color: 'text' },
          { id: bid('f'), type: 'field', label: 'Estado', value: '{{estado}}', align: 'left', color: 'accent' },
        ],
        right: [{ id: bid('q'), type: 'qr', size: 150, align: 'center', showCode: false }],
      },
      { id: bid('d'), type: 'divider', style: 'solid', color: 'muted', thickness: 1 },
      {
        id: bid('c'), type: 'columns', ratio: '1:1', valign: 'top',
        left: [{ id: bid('f'), type: 'field', label: 'Reserva', value: '{{cantidad}} × {{tipo}}', align: 'left', color: 'text' }],
        right: [{ id: bid('f'), type: 'field', label: 'A pagar al recoger', value: '{{pendiente}}', align: 'left', color: 'accent' }],
      },
      { id: bid('f'), type: 'field', label: 'Personas', value: '{{personas}}', align: 'left', color: 'text' },
      { id: bid('d'), type: 'divider', style: 'solid', color: 'muted', thickness: 1 },
      { id: bid('f'), type: 'field', label: 'Recogida y pago', value: '{{recogida_lugar}}\nHasta el {{recogida_plazo}}', align: 'left', color: 'text' },
      { id: bid('t'), type: 'text', text: '{{recogida_instrucciones}}', size: 'sm', align: 'left', color: 'text' },
      { id: bid('t'), type: 'text', text: 'Presenta este justificante (QR o código) en el punto de recogida. Lo que recibirás ({{articulo}}) es tu entrada al evento.', size: 'xs', align: 'left', color: 'muted' },
    ],
  }
}

export function blankPreset(kind: TemplateKind): BlockDesign {
  return { version: 2, kind, theme: theme({ backgroundColor: '#FFFFFF', textColor: '#111827', mutedColor: '#6B7280' }), blocks: [] }
}

/** Convierte una plantilla antigua (diseños fijos) a bloques con el mismo aspecto aproximado. */
export function fromLegacy(d: TicketDesign, descriptionTemplate: string): BlockDesign {
  const preset = ticketPreset()
  const fields: LeafBlock[] = [
    ...(d.showDate ? [{ id: bid('f'), type: 'field' as const, label: 'Fecha', value: '{{fecha}} · {{hora}}', align: 'left' as const, color: 'text' as const }] : []),
    ...(d.showVenue ? [{ id: bid('f'), type: 'field' as const, label: 'Lugar', value: '{{lugar}}', align: 'left' as const, color: 'text' as const }] : []),
    { id: bid('f'), type: 'field', label: 'Tipo', value: d.showPrice ? '{{tipo}} · {{precio}}' : '{{tipo}}', align: 'left', color: 'accent' },
    ...(d.showAttendee ? [{ id: bid('f'), type: 'field' as const, label: 'Asistente', value: '{{asistente}}', align: 'left' as const, color: 'text' as const }] : []),
  ]
  return {
    version: 2, kind: 'ticket',
    theme: { ...preset.theme, font: d.font, backgroundColor: d.backgroundColor, textColor: d.textColor, accentColor: d.accentColor,
      backgroundImageUrl: d.backgroundImageUrl, overlayOpacity: d.overlayOpacity, radius: d.radius, width: d.layout === 'vertical' ? 'narrow' : 'medium' },
    blocks: [
      ...(d.logoUrl ? [{ id: bid('i'), type: 'image' as const, url: d.logoUrl, height: 40, align: 'left' as const }] : []),
      ...(d.headline ? [{ id: bid('h'), type: 'heading' as const, text: d.headline, size: 'xs' as const, align: 'left' as const, color: 'accent' as const, weight: 'bold' as const, uppercase: true }] : []),
      { id: bid('h'), type: 'heading', text: '{{evento}}', size: 'xl', align: 'left', color: 'text', weight: 'black', uppercase: d.font === 'display' },
      { id: bid('c'), type: 'columns', ratio: '2:1', valign: 'middle', left: fields, right: [{ id: bid('q'), type: 'qr', size: 140, align: 'center', showCode: d.showCode }] },
      ...(descriptionTemplate.trim() ? [{ id: bid('t'), type: 'text' as const, text: descriptionTemplate, size: 'sm' as const, align: 'left' as const, color: 'text' as const }] : []),
      ...(d.footerText ? [{ id: bid('t'), type: 'text' as const, text: d.footerText, size: 'xs' as const, align: 'left' as const, color: 'muted' as const }] : []),
    ],
  }
}

/** Lee el jsonb guardado: plantilla por bloques o null si es del formato antiguo. */
export function parseBlockDesign(value: unknown): BlockDesign | null {
  if (typeof value !== 'object' || !value || (value as { version?: unknown }).version !== 2) return null
  const parsed = blockDesignSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const fontCss = (font: BlockTheme['font']) => FONTS[font].css
