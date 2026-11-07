'use client'

import { useRef, useState, useTransition } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, Trash2 } from 'lucide-react'
import { legacyTemplateSchema as templateSchema, type LegacyTemplateInput as TemplateInput } from '@/lib/validations/template'
import {
  DEFAULT_DESIGN,
  FONTS,
  LAYOUTS,
  PLACEHOLDERS,
  ticketDesignSchema,
  type PlaceholderKey,
  type TicketDesign,
} from '@/lib/tickets/design'
import { deleteTemplate, duplicateTemplate, saveTemplate } from '@/app/admin/plantillas/actions'
import { TicketCard, type TicketData } from '@/components/ticket/ticket-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const SAMPLE: TicketData = {
  eventTitle: 'Noche de Jazz en la Plaza',
  startsAt: '2026-10-17T19:30:00.000Z',
  venue: 'Plaza Mayor de la Hispanidad',
  typeName: 'General',
  typeDescription: 'Acceso a la zona de público',
  price: 12,
  attendeeName: 'Lucía Martín',
  code: 'A1B2C3D4E5F60718',
  status: 'valid',
}

/** Mientras se escribe un color o una URL a medias, la vista previa usa el valor por defecto de ese campo. */
function safePreviewDesign(design: Partial<TicketDesign> | undefined): TicketDesign {
  const result = { ...DEFAULT_DESIGN } as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_DESIGN) as (keyof TicketDesign)[]) {
    const value = design?.[key]
    if (ticketDesignSchema.shape[key].safeParse(value).success) result[key] = value
  }
  return result as TicketDesign
}

function ColorField({ form, name, label }: { form: UseFormReturn<TemplateInput>; name: 'backgroundColor' | 'textColor' | 'accentColor'; label: string }) {
  const value = useWatch({ control: form.control, name: `design.${name}` })
  const error = form.formState.errors.design?.[name]?.message
  const id = `design-${name}`
  const valid = /^#[0-9a-fA-F]{6}$/.test(value)

  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label}: selector`}
          className="border-input h-9 w-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
          value={valid ? value : '#000000'}
          onChange={(e) => form.setValue(`design.${name}`, e.target.value.toUpperCase(), { shouldDirty: true })}
        />
        <Input id={id} className="font-mono uppercase" maxLength={7} {...form.register(`design.${name}`)} />
      </div>
    </Field>
  )
}

function Toggle({ form, name, label }: { form: UseFormReturn<TemplateInput>; name: `design.${'showDate' | 'showVenue' | 'showPrice' | 'showAttendee' | 'showCode'}`; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="accent-primary size-4" {...form.register(name)} />
      {label}
    </label>
  )
}

export function TemplateEditor({ templateId, defaultValues }: { templateId?: string; defaultValues: TemplateInput }) {
  const [message, setMessage] = useState<{ type: 'error' | 'ok'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const form = useForm<TemplateInput>({ resolver: zodResolver(templateSchema), defaultValues })
  const { errors, isDirty } = form.formState
  const values = useWatch({ control: form.control })
  const preview = safePreviewDesign(values.design)

  const descriptionField = form.register('description_template')

  const insertPlaceholder = (key: PlaceholderKey) => {
    const el = textareaRef.current
    const token = `{{${key}}}`
    const current = form.getValues('description_template')
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    form.setValue('description_template', current.slice(0, start) + token + current.slice(end), { shouldDirty: true })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const run = (fn: () => Promise<{ error?: string; success?: boolean } | undefined>, okText?: string) => {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result?.error) setMessage({ type: 'error', text: result.error })
      else if (result?.success && okText) {
        setMessage({ type: 'ok', text: okText })
        form.reset(form.getValues())
      }
    })
  }

  const onSubmit = form.handleSubmit((data) => run(() => saveTemplate(templateId ?? null, data), 'Plantilla guardada'))

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* ---------------- Controles ---------------- */}
      <div className="order-2 space-y-6 lg:order-1">
        <Field label="Nombre de la plantilla" htmlFor="name" error={errors.name?.message}>
          <Input id="name" aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>

        <fieldset className="space-y-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Estructura</legend>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Diseño" htmlFor="layout">
              <NativeSelect id="layout" {...form.register('design.layout')}>
                {Object.entries(LAYOUTS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tipografía" htmlFor="font">
              <NativeSelect id="font" {...form.register('design.font')}>
                {Object.entries(FONTS).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label={`Esquinas redondeadas · ${preview.radius}px`} htmlFor="radius">
            <input id="radius" type="range" min={0} max={40} className="accent-primary" {...form.register('design.radius', { valueAsNumber: true })} />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Colores e imágenes</legend>
          <div className="grid grid-cols-2 gap-4">
            <ColorField form={form} name="backgroundColor" label="Fondo" />
            <ColorField form={form} name="textColor" label="Texto" />
            <ColorField form={form} name="accentColor" label="Acento" />
          </div>
          <Field label="Imagen de fondo (URL)" htmlFor="bg" error={errors.design?.backgroundImageUrl?.message}>
            <Input id="bg" type="url" placeholder="https://…" {...form.register('design.backgroundImageUrl')} />
          </Field>
          <Field label={`Oscurecer imagen · ${preview.overlayOpacity}%`} htmlFor="overlay">
            <input id="overlay" type="range" min={0} max={90} className="accent-primary" {...form.register('design.overlayOpacity', { valueAsNumber: true })} />
          </Field>
          <Field label="Logo (URL)" htmlFor="logo" error={errors.design?.logoUrl?.message}>
            <Input id="logo" type="url" placeholder="https://…" {...form.register('design.logoUrl')} />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Contenido</legend>
          <Field label="Etiqueta superior" htmlFor="headline" error={errors.design?.headline?.message}>
            <Input id="headline" placeholder="ENTRADA" {...form.register('design.headline')} />
          </Field>

          <div className="grid gap-2">
            <Label htmlFor="description_template">Descripción de la entrada</Label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insertar variable">
              {(Object.keys(PLACEHOLDERS) as PlaceholderKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  title={PLACEHOLDERS[key]}
                  onClick={() => insertPlaceholder(key)}
                  className="bg-secondary hover:bg-accent/40 rounded-md px-2 py-0.5 font-mono text-xs transition"
                >
                  {`{{${key}}}`}
                </button>
              ))}
            </div>
            <Textarea
              id="description_template"
              rows={4}
              {...descriptionField}
              ref={(el) => {
                descriptionField.ref(el)
                textareaRef.current = el
              }}
            />
            {errors.description_template ? (
              <p className="text-destructive text-xs">{errors.description_template.message}</p>
            ) : (
              <p className="text-muted-foreground text-xs">Pulsa una variable para insertarla donde está el cursor.</p>
            )}
          </div>

          <Field label="Texto al pie" htmlFor="footer" error={errors.design?.footerText?.message}>
            <Textarea id="footer" rows={2} {...form.register('design.footerText')} />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Toggle form={form} name="design.showDate" label="Fecha" />
            <Toggle form={form} name="design.showVenue" label="Lugar" />
            <Toggle form={form} name="design.showPrice" label="Precio" />
            <Toggle form={form} name="design.showAttendee" label="Asistente" />
            <Toggle form={form} name="design.showCode" label="Código bajo el QR" />
          </div>
        </fieldset>

        {message && (
          <p role="status" className={cn('text-sm', message.type === 'error' ? 'text-destructive' : 'text-success')}>
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || (!!templateId && !isDirty)}>
            {pending ? 'Guardando…' : templateId ? 'Guardar plantilla' : 'Crear plantilla'}
          </Button>
          {templateId && (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => duplicateTemplate(templateId))}>
                <Copy /> Duplicar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (confirm('¿Borrar la plantilla? Los tipos de entrada que la usen pasarán al diseño por defecto.')) {
                    run(() => deleteTemplate(templateId))
                  }
                }}
              >
                <Trash2 /> Borrar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ---------------- Vista previa ---------------- */}
      <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-20">
          <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">Vista previa</p>
          <div className="bg-secondary/60 grid min-h-72 place-items-center rounded-2xl border p-4 sm:p-8">
            <TicketCard design={preview} descriptionTemplate={values.description_template ?? ''} data={SAMPLE} />
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Datos de ejemplo. El QR siempre se imprime en negro sobre blanco para que se lea bien.
          </p>
        </div>
      </div>
    </form>
  )
}
