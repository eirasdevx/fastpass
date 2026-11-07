'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ticketTypeSchema, type TicketTypeInput } from '@/lib/validations/event'
import { deleteTicketType, saveTicketType } from '@/app/admin/eventos/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Field } from '@/components/ui/field'

export type TemplateOption = { id: string; name: string }

const EMPTY: TicketTypeInput = {
  name: '',
  description: '',
  price: 0,
  capacity: null,
  max_per_order: 10,
  template_id: null,
  sales_open: true,
}

export function TicketTypeForm({
  eventId,
  ticketTypeId,
  defaultValues,
  templates,
  canDelete,
  onDone,
  item,
}: {
  eventId: string
  ticketTypeId?: string
  defaultValues?: TicketTypeInput
  templates: TemplateOption[]
  canDelete?: boolean
  onDone?: () => void
  /** Solo en eventos de reserva con recogida: lo que se recoge (bonocopas, pulseras…). Otros textos y sin plantilla. */
  item?: string
}) {
  const pickup = !!item
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const prefix = ticketTypeId ?? 'new'

  const form = useForm<TicketTypeInput>({
    resolver: zodResolver(ticketTypeSchema),
    defaultValues: defaultValues ?? { ...EMPTY, template_id: item ? null : templates[0]?.id ?? null },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) => {
    setError(null)
    startTransition(async () => {
      const result = await saveTicketType(eventId, ticketTypeId ?? null, values)
      if (result.error) return setError(result.error)
      if (!ticketTypeId) form.reset({ ...EMPTY, template_id: values.template_id })
      onDone?.()
    })
  })

  const onDelete = () => {
    if (!ticketTypeId || !confirm(pickup ? `¿Borrar este tipo de ${item}?` : '¿Borrar este tipo de entrada?')) return
    startTransition(async () => {
      const result = await deleteTicketType(eventId, ticketTypeId)
      if (result.error) setError(result.error)
    })
  }

  const id = (name: string) => `${prefix}-${name}`

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={id('name')} error={errors.name?.message}>
          <Input id={id('name')} placeholder={pickup ? 'Básico, 5 consumiciones…' : 'General, VIP…'} aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field label={pickup ? 'Plantilla del justificante' : 'Plantilla'} htmlFor={id('template')}>
          <NativeSelect
            id={id('template')}
            {...form.register('template_id', { setValueAs: (v) => (v ? String(v) : null) })}
          >
            <option value="">{pickup ? 'Justificante por defecto' : 'Diseño por defecto'}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label="Descripción corta" htmlFor={id('description')} error={errors.description?.message}>
        <Input id={id('description')} placeholder="Acceso a pista, incluye consumición…" {...form.register('description')} />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label={pickup ? 'Precio al recoger (€)' : 'Precio (€)'} htmlFor={id('price')} error={errors.price?.message}>
          <Input id={id('price')} type="number" min={0} step="0.01" inputMode="decimal" {...form.register('price', { valueAsNumber: true })} />
        </Field>
        <Field label={pickup ? 'Cupo' : 'Aforo'} htmlFor={id('capacity')} error={errors.capacity?.message} hint="Vacío = sin límite">
          <Input
            id={id('capacity')}
            type="number"
            min={1}
            inputMode="numeric"
            {...form.register('capacity', { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })}
          />
        </Field>
        <Field label={pickup ? 'Máx. por reserva' : 'Máx. por pedido'} htmlFor={id('max')} error={errors.max_per_order?.message}>
          <Input id={id('max')} type="number" min={1} max={50} inputMode="numeric" {...form.register('max_per_order', { valueAsNumber: true })} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary size-4" {...form.register('sales_open')} />
        {pickup ? 'Se puede reservar' : 'Venta abierta'}
      </label>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Guardando…' : ticketTypeId ? 'Guardar' : pickup ? `Añadir tipo de ${item}` : 'Añadir tipo de entrada'}
        </Button>
        {ticketTypeId && canDelete && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onDelete} disabled={pending}>
            Borrar
          </Button>
        )}
      </div>
    </form>
  )
}
