import { create as createQr } from 'qrcode'
import {
  RESERVATION_NOTICE, SIZES, WIDTHS, fillVariables, fontCss,
  type Block, type BlockDesign, type BlockTheme, type LeafBlock, type TemplateVariables,
} from '@/lib/tickets/blocks'

// Dibuja una plantilla por bloques como HTML. Es el único dibujo: lo usan la web, la impresión
// (PDF), así que salen iguales. Solo estilos en línea, tablas para las columnas y márgenes en vez
// de flex/gap, para que también sirva tal cual en el cuerpo de un correo si algún día se envía.

export type BlockCardProps = {
  design: BlockDesign
  vars: TemplateVariables
  /** Contenido del QR; null para no mostrarlo (p. ej. reserva cancelada). */
  qrValue: string | null
  shortCode: string
  /** Sello superpuesto: «USADA», «CANCELADA»… */
  stamp?: string | null
}

type Ctx = { theme: BlockTheme; vars: TemplateVariables; qrValue: string | null; shortCode: string }
type Style = Record<string, string | number | undefined>

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c])

const UNITLESS = new Set(['lineHeight', 'fontWeight', 'opacity'])
/** Objeto de estilos → atributo style="" (camelCase a guiones; números en px). */
export function css(style: Style) {
  return esc(Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^webkit-/, '-webkit-')}:${typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : v}`)
    .join(';'))
}

const colorOf = (theme: BlockTheme, c: string) =>
  c === 'text' ? theme.textColor : c === 'accent' ? theme.accentColor : c === 'muted' ? theme.mutedColor : c
const rgba = (hex: string, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
const cssUrl = (url: string) => `url("${url.replace(/"/g, '%22')}")`
const text: Style = { margin: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }
const p = (style: Style, content: string, attrs = '') => `<p${attrs} style="${css({ ...text, ...style })}">${esc(content)}</p>`

/** QR en SVG, siempre negro sobre blanco: los colores del diseño no deben afectar a la lectura. */
export function qrSvg(value: string, size: number) {
  const { modules } = createQr(value, { errorCorrectionLevel: 'M' })
  let d = ''
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules.size} ${modules.size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Código QR" style="display:block"><path fill="#000000" d="${d}"/></svg>`
}

/** Bloques uno debajo de otro, separados por `gap` px; los vacíos no dejan hueco. */
const spaced = (items: (string | null)[], gap: number) =>
  items.filter((html): html is string => html !== null).map((html, i) => `<div style="${css({ marginTop: i ? gap : 0 })}">${html}</div>`).join('')

function leaf(block: LeafBlock, ctx: Ctx): string | null {
  const { theme, vars } = ctx
  switch (block.type) {
    case 'heading':
      return p({ fontSize: SIZES[block.size], lineHeight: 1.15, textAlign: block.align, color: colorOf(theme, block.color),
        fontWeight: block.weight === 'black' ? 900 : block.weight === 'bold' ? 700 : 400,
        textTransform: block.uppercase ? 'uppercase' : 'none', letterSpacing: block.uppercase ? '0.12em' : undefined }, fillVariables(block.text, vars))
    case 'text': {
      const value = fillVariables(block.text, vars)
      return value.trim() ? p({ fontSize: SIZES[block.size], lineHeight: 1.45, textAlign: block.align, color: colorOf(theme, block.color) }, value) : null
    }
    case 'field': {
      const value = fillVariables(block.value, vars)
      return `<div style="${css({ textAlign: block.align })}">`
        + (block.label ? p({ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.mutedColor }, block.label) : '')
        + (value.trim() ? p({ fontSize: SIZES.md, fontWeight: 600, color: colorOf(theme, block.color) }, value) : '')
        + '</div>'
    }
    case 'qr': {
      if (!ctx.qrValue) return null
      const box = css({ display: 'inline-block', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8 })
      return `<div style="${css({ textAlign: block.align })}"><div style="${box}">${qrSvg(ctx.qrValue, block.size)}</div>`
        + (block.showCode ? p({ marginTop: 6, fontFamily: fontCss('mono'), fontSize: SIZES.lg, fontWeight: 700, letterSpacing: '0.2em', color: theme.textColor }, ctx.shortCode) : '')
        + '</div>'
    }
    case 'code':
      return p({ fontFamily: fontCss('mono'), fontSize: SIZES[block.size], fontWeight: 800, letterSpacing: '0.25em', textAlign: block.align, color: colorOf(theme, block.color) }, ctx.shortCode)
    case 'image':
      if (!block.url) return null
      return `<div style="${css({ textAlign: block.align })}"><img src="${esc(block.url)}" alt="" style="${css({ height: block.height, maxWidth: '100%', objectFit: 'contain', display: 'inline-block' })}"></div>`
    case 'divider':
      return `<hr style="${css({ border: 0, borderTop: `${block.thickness}px ${block.style} ${colorOf(theme, block.color)}`, margin: 0 })}">`
    case 'spacer':
      return `<div aria-hidden="true" style="${css({ height: block.height })}"></div>`
    case 'notice': {
      const tone = block.tone === 'warning' ? '#D97706' : block.tone === 'accent' ? theme.accentColor : theme.mutedColor
      return p({ border: `2px solid ${tone}`, backgroundColor: rgba(tone, 0.12), borderRadius: 10, padding: '10px 12px', fontSize: SIZES.sm, fontWeight: 700, color: theme.textColor }, fillVariables(block.text, vars))
    }
  }
}

function blockHtml(block: Block, ctx: Ctx): string | null {
  if (block.type !== 'columns') return leaf(block, ctx)
  const [l, r] = block.ratio === '2:1' ? [66, 34] : block.ratio === '1:2' ? [34, 66] : [50, 50]
  const cell = (width: number, blocks: LeafBlock[], side: Style) =>
    `<td style="${css({ width: `${width}%`, verticalAlign: block.valign, ...side })}">${spaced(blocks.map((b) => leaf(b, ctx)), 12)}</td>`
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="${css({ width: '100%', borderCollapse: 'collapse' })}"><tbody><tr>`
    + cell(l, block.left, { paddingRight: 8 }) + cell(r, block.right, { paddingLeft: 8 }) + '</tr></tbody></table>'
}

export function renderBlockCard({ design, vars, qrValue, shortCode, stamp }: BlockCardProps) {
  const { theme } = design
  const ctx: Ctx = { theme, vars, qrValue, shortCode }
  const overlay = rgba(theme.backgroundColor, theme.overlayOpacity / 100)
  const background = theme.backgroundImageUrl ? `linear-gradient(${overlay}, ${overlay}), ${cssUrl(theme.backgroundImageUrl)} center / cover` : theme.backgroundColor
  const notice = design.kind === 'reservation'
    ? p({ border: '2px solid #D97706', backgroundColor: '#FEF3C7', color: '#451A03', borderRadius: 10, padding: '10px 12px', fontSize: SIZES.sm, fontWeight: 800, textTransform: 'uppercase' }, `⚠ ${RESERVATION_NOTICE}`, ' role="note"')
    : null
  const stampHtml = stamp
    ? `<div aria-hidden="true" style="${css({ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' })}">`
      + `<span style="${css({ transform: 'rotate(-12deg)', border: '4px solid #DC2626', backgroundColor: 'rgba(255,255,255,0.88)', color: '#DC2626', borderRadius: 10, padding: '6px 22px', fontSize: 30, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' })}">${esc(stamp)}</span></div>`
    : ''
  return `<article style="${css({
    position: 'relative', width: '100%', maxWidth: WIDTHS[theme.width].px, margin: '0 auto', boxSizing: 'border-box',
    background, backgroundColor: theme.backgroundColor, color: theme.textColor, fontFamily: fontCss(theme.font),
    borderRadius: theme.radius, border: theme.borderWidth ? `${theme.borderWidth}px solid ${theme.borderColor}` : undefined,
    padding: theme.padding, overflow: 'hidden', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', breakInside: 'avoid',
  })}">${spaced([notice, ...design.blocks.map((b) => blockHtml(b, ctx))], 14)}${stampHtml}</article>`
}
