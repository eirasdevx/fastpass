'use client'

import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { eventSchema, type EventInput } from '@/lib/validations/event'
import { createEvent, updateEvent } from '@/app/admin/eventos/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/select'
import { CoverUpload } from '@/components/admin/cover-upload'
import { LocationPicker } from '@/components/map/location-picker'
import { eventStatusLabels } from '@/lib/registrations'
import { cn } from '@/lib/utils'

const MODES = [
  {
    value: 'pickup', title: 'Reserva y pago en un punto de recogida',
    when: 'Se paga en persona y se entrega algo físico: bonocopas, pulseras, entradas de papel…',
    door: 'Lo que se recoge es la entrada (con sello, pulsera…). En «Accesos» se cobra y se entrega.',
  },
  {
    value: 'automatic', title: 'Inscripción gratuita con entrada digital',
    when: 'El evento es gratis y cada persona recibe al momento su entrada con QR.',
    door: 'En «Accesos» se escanea el QR de la entrada.',
  },
  {
    value: 'manual', title: 'Inscripción con aprobación',
    when: 'Quieres revisar cada solicitud antes de dar la entrada (invitaciones, plazas limitadas…).',
    door: 'Al aprobarla se emite la entrada con QR; en «Accesos» se escanea.',
  },
  {
    value: 'payment', title: 'Solicitud pendiente de pago (antigua)',
    when: 'Se registra la solicitud; no se cobra ni se emite la entrada.',
    door: 'Sin entrada digital mientras no haya pagos.',
  },
] as const

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-xl border p-4 sm:p-5">
      <legend className="flex items-center gap-2 px-1 font-semibold">
        <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-full text-xs">{step}</span>{title}
      </legend>
      {description && <p className="text-muted-foreground -mt-1 text-sm">{description}</p>}
      {children}
    </fieldset>
  )
}

export function EventForm({ eventId, defaultValues }: { eventId?: string; defaultValues: EventInput }) {
  const [message, setMessage] = useState<{ type: 'error' | 'ok'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const form = useForm<EventInput>({ resolver: zodResolver(eventSchema), defaultValues })
  const { errors } = form.formState
  const mode = useWatch({ control: form.control, name: 'registration_mode' })
  const enabled = useWatch({ control: form.control, name: 'registration_enabled' })
  const pickup = mode === 'pickup'
  const item = useWatch({ control: form.control, name: 'pickup_item_name' })?.trim() || 'bonocopas'
  const queueOn = useWatch({ control: form.control, name: 'queue_enabled' })
  const cover = useWatch({ control: form.control, name: 'cover_url' }) ?? ''
  const venue = useWatch({ control: form.control, name: 'venue' }) ?? ''
  const latitude = useWatch({ control: form.control, name: 'latitude' })
  const longitude = useWatch({ control: form.control, name: 'longitude' })
  const set = { shouldDirty: true, shouldValidate: true } as const
  // «Pendiente de pago» se solapa con la recogida: solo se muestra en eventos que ya la usan.
  const modes = MODES.filter((m) => m.value !== 'payment' || defaultValues.registration_mode === 'payment')
  const optionalNumber = { setValueAs: (value: string) => (value === '' ? null : Number(value)) }

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null)
    startTransition(async () => {
      const result = eventId ? await updateEvent(eventId, values) : await createEvent(values)
      if (result?.error) setMessage({ type: 'error', text: result.error })
      else if (result?.success) {
        setMessage({ type: 'ok', text: 'Cambios guardados' })
        form.reset(values)
      }
    })
  }, () => setMessage({ type: 'error', text: 'Revisa los campos marcados en rojo.' }))

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <Section step={1} title="Datos del evento">
        <Field label="Título" htmlFor="title" error={errors.title?.message}>
          <Input id="title" placeholder="Cotillón Nochevieja 2026" aria-invalid={!!errors.title} {...form.register('title')} />
        </Field>
        <Field label="Descripción" htmlFor="description" error={errors.description?.message}>
          <Textarea id="description" rows={4} {...form.register('description')} />
        </Field>
        <Field label="Lugar" htmlFor="venue" error={errors.venue?.message}>
          <Input id="venue" placeholder="Carpa de la Plaza de Toros, Medina del Campo" {...form.register('venue')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empieza" htmlFor="starts_at" error={errors.starts_at?.message} hint="Hora peninsular española">
            <Input id="starts_at" type="datetime-local" aria-invalid={!!errors.starts_at} {...form.register('starts_at')} />
          </Field>
          <Field label="Termina (opcional)" htmlFor="ends_at" error={errors.ends_at?.message}>
            <Input id="ends_at" type="datetime-local" aria-invalid={!!errors.ends_at} {...form.register('ends_at')} />
          </Field>
        </div>
        <Field label="Ubicación en el mapa (opcional)" htmlFor="latitude" error={errors.latitude?.message}
          hint="Así el público ve el sitio exacto y puede abrir «Cómo llegar».">
          <LocationPicker venue={venue}
            value={latitude != null && longitude != null ? { latitude, longitude } : null}
            onChange={(point) => { form.setValue('latitude', point?.latitude ?? null, set); form.setValue('longitude', point?.longitude ?? null, set) }} />
        </Field>
        <Field label="Imagen de portada (opcional)" htmlFor="cover_url" error={errors.cover_url?.message}>
          <CoverUpload value={cover} error={errors.cover_url?.message} onChange={(url) => form.setValue('cover_url', url, set)} />
        </Field>
      </Section>

      <Section step={2} title="¿Cómo se consiguen las plazas?">
        <div role="radiogroup" className="grid gap-2">
          {modes.map((m) => (
            <label key={m.value} className={cn('hover:bg-secondary/50 flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition',
              mode === m.value && 'border-primary bg-primary/5 ring-primary ring-1')}>
              <input type="radio" value={m.value} className="mt-1" {...form.register('registration_mode')} />
              <span className="grid gap-1">
                <span className="font-medium">{m.title}</span>
                <span className="text-muted-foreground text-xs"><strong>Elige esto si:</strong> {m.when}</span>
                <span className="text-muted-foreground text-xs"><strong>En la puerta:</strong> {m.door}</span>
              </span>
            </label>
          ))}
        </div>
        <label className={cn('flex items-center gap-3 rounded-lg border p-3 text-sm', enabled ? 'border-success bg-success/10' : 'bg-secondary/40')}>
          <input type="checkbox" className="size-5" {...form.register('registration_enabled')} />
          <span>
            <span className="font-medium">{pickup ? 'Reservas abiertas' : 'Formulario abierto'}</span>
            <span className="text-muted-foreground block text-xs">
              {enabled ? 'El público puede usarlo en cuanto el evento esté publicado.' : 'Desactivado: nadie puede reservar ni inscribirse ahora mismo.'}
            </span>
          </span>
        </label>
        <div className="grid gap-2 text-sm">
          <label className="flex gap-3"><input type="checkbox" {...form.register('last_name_required')} />Pedir apellidos (obligatorios)</label>
          <label className="flex gap-3"><input type="checkbox" {...form.register('phone_required')} />Pedir teléfono (obligatorio)</label>
          {!pickup && <label className="flex gap-3"><input type="checkbox" {...form.register('prevent_duplicates')} />Solo una inscripción activa por correo</label>}
        </div>
      </Section>

      <Section step={3} title="Aforo" description="Máximo de personas autorizado. Ninguna combinación de reservas, entregas y otros canales podrá superarlo.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Aforo autorizado" htmlFor="capacity" error={errors.capacity?.message} hint="Vacío: solo limitan los cupos de cada tipo">
            <Input id="capacity" type="number" min="1" placeholder="500" {...form.register('capacity', optionalNumber)} />
          </Field>
          {pickup && (
            <Field label="Plazas para venta directa y otros canales" htmlFor="reserved_other_channels" error={errors.reserved_other_channels?.message} hint="Se restan del aforo: no se pueden reservar por la web">
              <Input id="reserved_other_channels" type="number" min={0} {...form.register('reserved_other_channels', { setValueAs: (value: string) => (value === '' ? 0 : Number(value)) })} />
            </Field>
          )}
        </div>
      </Section>

      {pickup && (
        <Section step={4} title="Reservas y recogida" description={`Qué se recoge, dónde y hasta cuándo se recoge y se paga.`}>
          <Field label="¿Qué se recoge?" htmlFor="pickup_item_name" error={errors.pickup_item_name?.message}
            hint="En plural y minúsculas. Aparece en la web y en el justificante: «Reservar bonocopas», «Tipos de pulseras»…">
            <Input id="pickup_item_name" placeholder="bonocopas, pulseras, entradas físicas…" maxLength={40} {...form.register('pickup_item_name')} />
          </Field>
          <Field label="Dirección del punto de recogida" htmlFor="pickup_address" error={errors.pickup_address?.message}>
            <Input id="pickup_address" placeholder="Boulevard Café & Copas, C/ …, Medina del Campo" aria-invalid={!!errors.pickup_address} {...form.register('pickup_address')} />
          </Field>
          <Field label="Instrucciones de recogida (opcional)" htmlFor="pickup_instructions" error={errors.pickup_instructions?.message}
            hint="Horario, qué llevar (justificante y DNI), formas de pago aceptadas…">
            <Textarea id="pickup_instructions" rows={3} placeholder="De lunes a viernes de 18:00 a 21:00. Trae el justificante y tu DNI. Se acepta efectivo y tarjeta." {...form.register('pickup_instructions')} />
          </Field>
          <Field label="Fecha límite de recogida (opcional)" htmlFor="pickup_deadline" error={errors.pickup_deadline?.message}
            hint="Pasada esta fecha, lo no recogido caduca y la plaza vuelve a quedar libre.">
            <Input id="pickup_deadline" type="datetime-local" {...form.register('pickup_deadline')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Abrir reservas el (opcional)" htmlFor="reservations_open_at" error={errors.reservations_open_at?.message} hint="Vacío: desde que se publica">
              <Input id="reservations_open_at" type="datetime-local" {...form.register('reservations_open_at')} />
            </Field>
            <Field label="Cerrar reservas el (opcional)" htmlFor="reservations_close_at" error={errors.reservations_close_at?.message}>
              <Input id="reservations_close_at" type="datetime-local" aria-invalid={!!errors.reservations_close_at} {...form.register('reservations_close_at')} />
            </Field>
          </div>
          {defaultValues.queue_enabled !== undefined && (
            <div className="grid gap-3 rounded-lg border p-3 text-sm">
              <label className="flex gap-3">
                <input type="checkbox" className="mt-0.5" {...form.register('queue_enabled')} />
                <span><span className="font-medium">Sala de espera virtual</span>
                  <span className="text-muted-foreground block text-xs">Para aperturas con mucha gente: si se llena el formulario, cada persona espera su turno viendo cuántas tiene delante (como en Renfe). Cada turno dura 15 minutos.</span></span>
              </label>
              {queueOn && (
                <Field label="Personas a la vez en el formulario" htmlFor="queue_capacity" error={errors.queue_capacity?.message}
                  hint="Las demás esperan. Con 100 suele ir bien; súbelo si la web va rápida y la cola avanza lenta.">
                  <Input id="queue_capacity" type="number" min={1} max={10000} className="sm:w-32" {...form.register('queue_capacity', { valueAsNumber: true })} />
                </Field>
              )}
            </div>
          )}
          <Field label={`Máximo de ${item} por persona (opcional)`} htmlFor="max_per_person" error={errors.max_per_person?.message} hint="Suma de todas sus reservas con el mismo correo">
            <Input id="max_per_person" type="number" min={1} max={100} {...form.register('max_per_person', optionalNumber)} />
          </Field>
          <div className="grid gap-3 rounded-lg border p-3 text-sm">
            <p className="font-medium">Datos de cada persona</p>
            <label className="flex gap-3"><input type="checkbox" {...form.register('attendee_details')} />Pedir nombre y apellidos de cada persona si se reserva más de una</label>
            <label className="flex gap-3"><input type="checkbox" {...form.register('require_document')} />Pedir DNI, NIE o pasaporte</label>
            <label className="flex gap-3"><input type="checkbox" {...form.register('require_birth_date')} />Pedir fecha de nacimiento</label>
            <Field label="Edad mínima el día del evento (opcional)" htmlFor="min_age" error={errors.min_age?.message} hint="Se pedirá la fecha de nacimiento y se rechazará a quien no la cumpla. Vacío: sin límite.">
              <Input id="min_age" type="number" min={1} max={120} placeholder="18" className="sm:w-32" {...form.register('min_age', optionalNumber)} />
            </Field>
            <p className="text-muted-foreground text-xs">Si pides DNI o fecha de nacimiento, se piden a todas las personas, titular incluido. Solo la organización del evento los ve.</p>
          </div>
        </Section>
      )}

      <Section step={pickup ? 5 : 4} title="Privacidad" description="Obligatorio para abrir el formulario: aparece en la información de privacidad que acepta el público.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsable de los datos" htmlFor="privacy_controller" error={errors.privacy_controller?.message} hint="Normalmente, el grupo organizador">
            <Input id="privacy_controller" aria-invalid={!!errors.privacy_controller} {...form.register('privacy_controller')} />
          </Field>
          <Field label="Correo para temas de privacidad" htmlFor="privacy_contact" error={errors.privacy_contact?.message}>
            <Input id="privacy_contact" type="email" aria-invalid={!!errors.privacy_contact} {...form.register('privacy_contact')} />
          </Field>
        </div>
        <Field label="Conservar los datos tras el evento (días)" htmlFor="retention_days" error={errors.retention_days?.message}>
          <Input id="retention_days" type="number" min={1} max={3650} className="sm:w-40" {...form.register('retention_days', { valueAsNumber: true })} />
        </Field>
      </Section>

      <Section step={pickup ? 6 : 5} title="Publicación">
        <Field label="Estado del evento" htmlFor="status" hint="En «Borrador» solo lo ves tú. Publícalo cuando esté todo listo.">
          <NativeSelect id="status" {...form.register('status')}>
            {Object.entries(eventStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </NativeSelect>
        </Field>
      </Section>

      {/* Barra flotante: siempre a mano al bajar por el formulario y sin tapar los campos. */}
      <div className="bg-card/90 sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur">
        <p role="status" className={cn('flex items-center gap-2 text-sm',
          message?.type === 'error' ? 'text-destructive' : message && !form.formState.isDirty ? 'text-success' : 'text-muted-foreground')}>
          {message && !form.formState.isDirty ? message.text : message?.type === 'error' ? message.text : eventId ? (
            form.formState.isDirty
              ? <><span className="bg-warning size-2 rounded-full" aria-hidden />Tienes cambios sin guardar</>
              : 'Sin cambios pendientes'
          ) : 'Completa los datos y crea el evento'}
        </p>
        <Button type="submit" disabled={pending || (!!eventId && !form.formState.isDirty)}>
          {pending ? 'Guardando…' : eventId ? 'Guardar cambios' : 'Crear evento y seguir'}
        </Button>
      </div>
    </form>
  )
}
