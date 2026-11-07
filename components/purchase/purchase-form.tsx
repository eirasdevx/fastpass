'use client'

import { useRef, useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Minus, Plus } from 'lucide-react'
import { purchaseSchema, type PurchaseInput } from '@/lib/validations/purchase'
import { purchaseTickets } from '@/app/(public)/eventos/[slug]/actions'
import { formatPrice } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export type PurchasableType = {
  id: string
  name: string
  description: string
  price: number
  maxQuantity: number // min(max_per_order, disponibles); 0 = agotado
  salesOpen: boolean
}

export function PurchaseForm({ eventId, types }: { eventId: string; types: PurchasableType[] }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const request = useRef<{ payload: string; id: string } | null>(null)

  const form = useForm<PurchaseInput>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      buyer_name: '',
      buyer_email: '',
      items: types.map((t) => ({ ticket_type_id: t.id, quantity: 0 })),
    },
  })

  const items = useWatch({ control: form.control, name: 'items' })
  const total = items.reduce((sum, item, i) => sum + item.quantity * types[i].price, 0)
  const count = items.reduce((sum, item) => sum + item.quantity, 0)

  const setQty = (index: number, value: number) => {
    const max = types[index].maxQuantity
    form.setValue(`items.${index}.quantity`, Math.max(0, Math.min(max, value)), { shouldValidate: form.formState.isSubmitted })
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => form.handleSubmit((values) => {
    setServerError(null)
    const payload = JSON.stringify(values)
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() }
    const requestId = request.current.id
    startTransition(async () => {
      const result = await purchaseTickets(eventId, { ...values, request_id: requestId })
      if (result?.error) setServerError(result.error)
    })
  })(event)

  const { errors } = form.formState

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <fieldset className="space-y-3">
        <legend className="mb-3 font-semibold">Entradas</legend>
        {types.map((type, index) => {
          const qty = items[index]?.quantity ?? 0
          const unavailable = !type.salesOpen || type.maxQuantity === 0
          return (
            <div key={type.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="min-w-0">
                <p className="font-medium">{type.name}</p>
                {type.description && <p className="text-muted-foreground text-sm">{type.description}</p>}
                <p className="mt-1 text-sm font-semibold">{formatPrice(type.price)}</p>
              </div>
              {unavailable ? (
                <span className="text-muted-foreground shrink-0 text-sm font-medium">
                  {type.salesOpen ? 'Agotadas' : 'No disponible'}
                </span>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setQty(index, qty - 1)}
                    disabled={qty === 0}
                    aria-label={`Quitar una entrada ${type.name}`}
                  >
                    <Minus />
                  </Button>
                  <output className="w-6 text-center font-mono tabular-nums" aria-live="polite">
                    {qty}
                  </output>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setQty(index, qty + 1)}
                    disabled={qty >= type.maxQuantity}
                    aria-label={`Añadir una entrada ${type.name}`}
                  >
                    <Plus />
                  </Button>
                </div>
              )}
            </div>
          )
        })}
        {errors.items?.root?.message && (
          <p role="alert" className="text-destructive text-sm">
            {errors.items.root.message}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Tus datos</legend>
        <Field label="Nombre y apellidos" htmlFor="buyer_name" error={errors.buyer_name?.message}>
          <Input id="buyer_name" autoComplete="name" aria-invalid={!!errors.buyer_name} {...form.register('buyer_name')} />
        </Field>
        <Field label="Email" htmlFor="buyer_email" error={errors.buyer_email?.message}>
          <Input
            id="buyer_email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.buyer_email}
            {...form.register('buyer_email')}
          />
        </Field>
      </fieldset>

      {serverError && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {serverError}
        </p>
      )}

      <div className="bg-secondary flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          {count} {count === 1 ? 'entrada' : 'entradas'} · <strong className="text-base">{formatPrice(total)}</strong>
        </p>
        <Button type="submit" size="lg" disabled={pending || count === 0}>
          {pending ? 'Generando entradas…' : 'Conseguir entradas'}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        El pago aún no está activado: las entradas se emiten al confirmar.
      </p>
    </form>
  )
}
