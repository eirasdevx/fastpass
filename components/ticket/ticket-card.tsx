import type { CSSProperties } from 'react'
import { cn, formatTicketCode } from '@/lib/utils'
import { formatDate, formatPrice, formatTime } from '@/lib/format'
import { parseBlockDesign } from '@/lib/tickets/blocks'
import { BlockCard } from './block-card'
import {
  FONTS,
  parseDesign,
  renderDescription,
  type TicketDesign,
  type TicketVariables,
} from '@/lib/tickets/design'
import type { TicketStatus } from '@/types/database'
import { TicketQR } from './ticket-qr'

export type TicketData = {
  eventTitle: string
  startsAt: string
  venue: string
  typeName: string
  typeDescription: string
  price: number
  attendeeName: string
  code: string
  shortCode?: string
  status?: TicketStatus
}

export function ticketVariables(data: TicketData): TicketVariables {
  return {
    evento: data.eventTitle,
    fecha: formatDate(data.startsAt),
    hora: formatTime(data.startsAt),
    lugar: data.venue,
    tipo: data.typeName,
    descripcion_tipo: data.typeDescription,
    precio: formatPrice(data.price),
    asistente: data.attendeeName,
    codigo: formatTicketCode(data.shortCode ?? data.code),
  }
}

const cssUrl = (url: string) => `url("${url.replace(/"/g, '%22')}")`

/**
 * Pinta una entrada a partir de su plantilla. Sin estado: se usa igual en la
 * vista del cliente (servidor) y en la vista previa del editor (cliente).
 */
export function TicketCard({
  design,
  descriptionTemplate,
  data,
  className,
}: {
  design: TicketDesign
  descriptionTemplate: string
  data: TicketData
  className?: string
}) {
  const description = renderDescription(descriptionTemplate, ticketVariables(data))
  const isDisplay = design.font === 'display'

  const rootStyle: CSSProperties = {
    backgroundColor: design.backgroundColor,
    color: design.textColor,
    borderRadius: design.radius,
    fontFamily: FONTS[design.font].css,
  }

  const background =
    design.backgroundImageUrl && design.layout !== 'minimal' ? (
      <>
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: cssUrl(design.backgroundImageUrl) }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundColor: design.backgroundColor, opacity: design.overlayOpacity / 100 }}
        />
      </>
    ) : null

  const logo = design.logoUrl ? (
    <div
      role="img"
      aria-label="Logo"
      className="size-10 shrink-0 bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: cssUrl(design.logoUrl) }}
    />
  ) : null

  const headline = design.headline ? (
    <p className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: design.accentColor }}>
      {design.headline}
    </p>
  ) : null

  const title = (
    <h3
      className={cn(
        'text-2xl leading-tight font-bold text-balance',
        isDisplay && 'text-3xl tracking-wide uppercase'
      )}
    >
      {data.eventTitle}
    </h3>
  )

  const details = (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {design.showDate && (
        <div className="col-span-2">
          <dt className="text-[10px] tracking-widest uppercase opacity-60">Fecha</dt>
          <dd className="font-medium first-letter:uppercase">
            {formatDate(data.startsAt)} · {formatTime(data.startsAt)}
          </dd>
        </div>
      )}
      {design.showVenue && data.venue && (
        <div className="col-span-2">
          <dt className="text-[10px] tracking-widest uppercase opacity-60">Lugar</dt>
          <dd className="font-medium">{data.venue}</dd>
        </div>
      )}
      <div>
        <dt className="text-[10px] tracking-widest uppercase opacity-60">Tipo</dt>
        <dd className="font-semibold" style={{ color: design.accentColor }}>
          {data.typeName}
        </dd>
      </div>
      {design.showPrice && (
        <div>
          <dt className="text-[10px] tracking-widest uppercase opacity-60">Precio</dt>
          <dd className="font-medium">{formatPrice(data.price)}</dd>
        </div>
      )}
      {design.showAttendee && (
        <div className="col-span-2">
          <dt className="text-[10px] tracking-widest uppercase opacity-60">Asistente</dt>
          <dd className="font-medium">{data.attendeeName}</dd>
        </div>
      )}
    </dl>
  )

  const descriptionBlock = description.trim() ? (
    <p className="text-sm leading-relaxed whitespace-pre-line opacity-85">{description}</p>
  ) : null

  const footer = design.footerText ? (
    <p className="text-[11px] leading-snug opacity-60">{design.footerText}</p>
  ) : null

  const qr = (
    <div className="flex flex-col items-center gap-2">
      <TicketQR value={data.code} />
      {design.showCode && (
        <p className={cn('font-mono tracking-wider',data.shortCode?'text-3xl font-bold':'text-xs opacity-80')}>{data.shortCode ?? formatTicketCode(data.code)}</p>
      )}
    </div>
  )

  const stamp =
    data.status && data.status !== 'valid' ? (
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <span className="-rotate-12 rounded-lg border-4 border-red-500 bg-white/85 px-6 py-2 text-3xl font-black tracking-widest text-red-600 uppercase">
          {data.status === 'used' ? 'Usada' : 'Anulada'}
        </span>
      </div>
    ) : null

  // ---------------------------------------------------------------------------
  if (design.layout === 'vertical') {
    return (
      <article
        className={cn('relative mx-auto w-full max-w-sm overflow-hidden shadow-lg', className)}
        style={rootStyle}
      >
        {background}
        {stamp}
        <div className="relative z-10 flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              {headline}
              {title}
            </div>
            {logo}
          </div>
          {details}
          {descriptionBlock}
        </div>
        <div className="relative z-10 flex items-center" aria-hidden>
          <span className="bg-background -ml-3 size-6 rounded-full" />
          <span className="flex-1 border-t-2 border-dashed opacity-40" style={{ borderColor: design.textColor }} />
          <span className="bg-background -mr-3 size-6 rounded-full" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-3 p-6">
          {qr}
          {footer && <div className="text-center">{footer}</div>}
        </div>
      </article>
    )
  }

  if (design.layout === 'minimal') {
    return (
      <article
        className={cn('@container relative flex w-full overflow-hidden border shadow-sm', className)}
        style={{ ...rootStyle, borderColor: design.accentColor }}
      >
        {stamp}
        <div className="flex flex-1">
          <div className="w-2 shrink-0" style={{ backgroundColor: design.accentColor }} aria-hidden />
          <div className="flex flex-1 flex-col gap-5 p-5 @md:flex-row @md:items-center">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                {logo}
                <div className="space-y-0.5">
                  {headline}
                  {title}
                </div>
              </div>
              {details}
              {descriptionBlock}
              {footer}
            </div>
            <div className="self-center">{qr}</div>
          </div>
        </div>
      </article>
    )
  }

  // horizontal (por defecto)
  return (
    <article
      className={cn('@container relative w-full overflow-hidden shadow-lg', className)}
      style={rootStyle}
    >
      {background}
      {stamp}
      <div className="relative z-10 flex flex-col @lg:flex-row">
        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              {headline}
              {title}
            </div>
            {logo}
          </div>
          {details}
          {descriptionBlock}
          {footer && <div className="mt-auto">{footer}</div>}
        </div>
        <div
          className="flex items-center justify-center border-t-2 border-dashed p-6 @lg:border-t-0 @lg:border-l-2"
          style={{ borderColor: `${design.textColor}55`, backgroundColor: `${design.accentColor}1a` }}
        >
          {qr}
        </div>
      </div>
    </article>
  )
}

/** Entrada con su plantilla guardada: por bloques (versión 2) o del formato antiguo. */
export function TemplatedTicket({ design, descriptionTemplate, data, className }: {
  design: unknown
  descriptionTemplate: string
  data: TicketData
  className?: string
}) {
  const blocks = parseBlockDesign(design)
  if (!blocks) return <TicketCard design={parseDesign(design)} descriptionTemplate={descriptionTemplate} data={data} className={className} />
  return (
    <BlockCard design={{ ...blocks, kind: 'ticket' }} vars={ticketVariables(data)} qrValue={data.code}
      shortCode={data.shortCode ?? formatTicketCode(data.code)}
      stamp={data.status === 'used' ? 'Usada' : data.status === 'cancelled' ? 'Anulada' : null} />
  )
}
