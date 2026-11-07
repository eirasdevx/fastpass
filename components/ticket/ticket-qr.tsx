'use client'

import { QRCodeSVG } from 'qrcode.react'

/** QR siempre en negro sobre blanco: los colores del diseño no deben afectar a la lectura. */
export function TicketQR({ value, size = 132 }: { value: string; size?: number }) {
  return (
    <div className="rounded-lg bg-white p-2 shadow-sm">
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} title={`Código ${value}`} />
    </div>
  )
}
