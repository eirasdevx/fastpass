'use client'

import { createContext, useContext, useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2, X } from 'lucide-react'
import {
  BLOCK_LABELS, SIZE_LABELS, VARIABLES, WIDTHS, blockDesignSchema,
  type Block, type BlockDesign, type BlockTheme, type LeafBlock,
} from '@/lib/tickets/blocks'
import { FONTS } from '@/lib/tickets/design'
import { SAMPLE_RESERVATION, reservationVariables } from '@/lib/tickets/template-data'
import { deleteTemplate, duplicateTemplate, saveTemplate } from '@/app/admin/plantillas/actions'
import { BlockCard } from '@/components/ticket/block-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const SAMPLE_TICKET_VARS = {
  evento: 'Noche de Jazz en la Plaza', fecha: 'sábado, 17 de octubre de 2026', hora: '21:30', lugar: 'Plaza Mayor',
  tipo: 'General', descripcion_tipo: 'Acceso a la zona de público', precio: '12,00 €', asistente: 'Lucía Martín', codigo: 'A7K2',
}

const newId = (type: string) => `${type}-${crypto.randomUUID().slice(0, 8)}`

function newBlock(type: Block['type']): Block {
  const id = newId(type)
  switch (type) {
    case 'heading': return { id, type, text: 'Título', size: 'lg', align: 'left', color: 'text', weight: 'bold', uppercase: false }
    case 'text': return { id, type, text: 'Escribe aquí. Puedes usar variables como {{evento}}.', size: 'sm', align: 'left', color: 'text' }
    case 'field': return { id, type, label: 'Etiqueta', value: '{{evento}}', align: 'left', color: 'text' }
    case 'qr': return { id, type, size: 140, align: 'center', showCode: true }
    case 'code': return { id, type, size: 'xl', align: 'center', color: 'text' }
    case 'image': return { id, type, url: '', height: 60, align: 'left' }
    case 'divider': return { id, type, style: 'dashed', color: 'muted', thickness: 1 }
    case 'spacer': return { id, type, height: 16 }
    case 'notice': return { id, type, text: 'Aviso importante', tone: 'accent' }
    case 'columns': return { id, type, ratio: '1:1', valign: 'top', left: [newBlock('text') as LeafBlock], right: [newBlock('qr') as LeafBlock] }
  }
}

function blockSummary(b: Block) {
  switch (b.type) {
    case 'heading': case 'text': case 'notice': return b.text.slice(0, 40)
    case 'field': return `${b.label}: ${b.value}`.slice(0, 40)
    case 'image': return b.url ? 'con imagen' : 'sin imagen'
    case 'columns': return `${b.left.length} + ${b.right.length} bloques`
    default: return ''
  }
}

// --- Inserción de variables en el último campo de texto usado --------------------------------
type Inserter = (token: string) => void
const InsertContext = createContext<{ setActive: (fn: Inserter | null) => void }>({ setActive: () => {} })

function VarInput({ value, onChange, multiline, rows = 3, id }: { value: string; onChange: (v: string) => void; multiline?: boolean; rows?: number; id: string }) {
  const { setActive } = useContext(InsertContext)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const register = () => setActive((token) => {
    const el = ref.current
    const start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? value.length
    const current = el?.value ?? value
    onChange(current.slice(0, start) + token + current.slice(end))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  })
  return multiline
    ? <Textarea id={id} ref={ref} rows={rows} value={value} onFocus={register} onChange={(e) => onChange(e.target.value)} />
    : <Input id={id} ref={ref} value={value} onFocus={register} onChange={(e) => onChange(e.target.value)} />
}

// --- Controles reutilizables --------------------------------------------------------------------
function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium">{label}
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.entries(options) as [T, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </NativeSelect>
    </label>
  )
}
function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return <label className="grid gap-1 text-xs font-medium">{label} · {value}<input type="range" min={min} max={max} value={value} className="accent-primary" onChange={(e) => onChange(Number(e.target.value))} /></label>
}
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium">{label}
      <span className="flex gap-2">
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="border-input h-9 w-11 shrink-0 cursor-pointer rounded-md border p-1" />
        <Input value={value} maxLength={7} className="font-mono uppercase" onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  )
}
function BlockColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const preset = ['text', 'accent', 'muted'].includes(value)
  return (
    <div className="grid gap-1">
      <Select label="Color" value={(preset ? value : 'custom') as 'text' | 'accent' | 'muted' | 'custom'}
        options={{ text: 'Texto', accent: 'Acento', muted: 'Atenuado', custom: 'Personalizado' }}
        onChange={(v) => onChange(v === 'custom' ? '#2563EB' : v)} />
      {!preset && <input type="color" aria-label="Color personalizado" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="border-input h-9 w-full cursor-pointer rounded-md border p-1" />}
    </div>
  )
}
const ALIGN = { left: 'Izquierda', center: 'Centro', right: 'Derecha' } as const

function LeafProperties({ block, onChange }: { block: LeafBlock; onChange: (b: LeafBlock) => void }) {
  const set = <K extends string>(patch: Record<K, unknown>) => onChange({ ...block, ...patch } as LeafBlock)
  const id = `p-${block.id}`
  switch (block.type) {
    case 'heading':
      return <div className="grid gap-3">
        <Field label="Texto" htmlFor={id}><VarInput id={id} value={block.text} onChange={(text) => set({ text })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Tamaño" value={block.size} options={SIZE_LABELS} onChange={(size) => set({ size })} />
          <Select label="Grosor" value={block.weight} options={{ normal: 'Normal', bold: 'Negrita', black: 'Muy grueso' }} onChange={(weight) => set({ weight })} />
          <Select label="Alineación" value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
          <BlockColor value={block.color} onChange={(color) => set({ color })} />
        </div>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={block.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} />EN MAYÚSCULAS</label>
      </div>
    case 'text':
      return <div className="grid gap-3">
        <Field label="Texto" htmlFor={id}><VarInput id={id} multiline value={block.text} onChange={(text) => set({ text })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Tamaño" value={block.size} options={SIZE_LABELS} onChange={(size) => set({ size })} />
          <Select label="Alineación" value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
          <BlockColor value={block.color} onChange={(color) => set({ color })} />
        </div>
      </div>
    case 'field':
      return <div className="grid gap-3">
        <Field label="Etiqueta" htmlFor={`${id}-l`}><Input id={`${id}-l`} value={block.label} onChange={(e) => set({ label: e.target.value })} /></Field>
        <Field label="Valor" htmlFor={id}><VarInput id={id} multiline rows={2} value={block.value} onChange={(value) => set({ value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Alineación" value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
          <BlockColor value={block.color} onChange={(color) => set({ color })} />
        </div>
      </div>
    case 'qr':
      return <div className="grid gap-3">
        <Range label="Tamaño (px)" value={block.size} min={80} max={260} onChange={(size) => set({ size })} />
        <Select label="Alineación" value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={block.showCode} onChange={(e) => set({ showCode: e.target.checked })} />Mostrar el código debajo</label>
        <p className="text-muted-foreground text-xs">El QR se pinta siempre negro sobre blanco para que se lea bien.</p>
      </div>
    case 'code':
      return <div className="grid grid-cols-2 gap-3">
        <Select label="Tamaño" value={block.size} options={SIZE_LABELS} onChange={(size) => set({ size })} />
        <Select label="Alineación" value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
        <BlockColor value={block.color} onChange={(color) => set({ color })} />
      </div>
    case 'image':
      return <div className="grid gap-3">
        <Field label="Dirección de la imagen (URL)" htmlFor={id}><Input id={id} type="url" placeholder="https://…" value={block.url} onChange={(e) => set({ url: e.target.value })} /></Field>
        <Range label="Alto (px)" value={block.height} min={16} max={320} onChange={(height) => set({ height })} />
        <Select label="Alineación" value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
      </div>
    case 'divider':
      return <div className="grid grid-cols-2 gap-3">
        <Select label="Estilo" value={block.style} options={{ solid: 'Continua', dashed: 'Discontinua', dotted: 'Puntos' }} onChange={(style) => set({ style })} />
        <BlockColor value={block.color} onChange={(color) => set({ color })} />
        <Range label="Grosor" value={block.thickness} min={1} max={8} onChange={(thickness) => set({ thickness })} />
      </div>
    case 'spacer':
      return <Range label="Alto (px)" value={block.height} min={4} max={120} onChange={(height) => set({ height })} />
    case 'notice':
      return <div className="grid gap-3">
        <Field label="Texto" htmlFor={id}><VarInput id={id} multiline rows={2} value={block.text} onChange={(text) => set({ text })} /></Field>
        <Select label="Tono" value={block.tone} options={{ warning: 'Advertencia (ámbar)', accent: 'Color de acento', neutral: 'Neutro' }} onChange={(tone) => set({ tone })} />
      </div>
  }
}

// --- Lista de bloques --------------------------------------------------------------------------
function BlockList<T extends Block>({ blocks, onChange, allowColumns, compact }: { blocks: T[]; onChange: (blocks: T[]) => void; allowColumns: boolean; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<Block['type']>('text')
  const move = (i: number, d: number) => { const next = [...blocks]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next) }
  const types = (Object.keys(BLOCK_LABELS) as Block['type'][]).filter((t) => allowColumns || t !== 'columns')

  return (
    <div className="grid gap-2">
      {blocks.length === 0 && <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">Sin bloques todavía.</p>}
      {blocks.map((b, i) => (
        <div key={b.id} className={cn('bg-card rounded-lg border', open === b.id && 'ring-primary ring-1')}>
          <div className="flex items-center gap-1 p-2">
            <button type="button" onClick={() => setOpen(open === b.id ? null : b.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
              <ChevronDown className={cn('size-4 shrink-0 transition', open === b.id && 'rotate-180')} />
              <span className="font-medium">{BLOCK_LABELS[b.type]}</span>
              <span className="text-muted-foreground truncate text-xs">{blockSummary(b)}</span>
            </button>
            <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Bajar" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
            <Button type="button" size="icon" variant="ghost" className="text-destructive size-7" aria-label="Quitar" onClick={() => onChange(blocks.filter((x) => x.id !== b.id))}><X /></Button>
          </div>
          {open === b.id && (
            <div className="border-t p-3">
              {b.type === 'columns' ? (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Reparto" value={b.ratio} options={{ '1:1': 'Mitad y mitad', '2:1': 'Ancha + estrecha', '1:2': 'Estrecha + ancha' }} onChange={(ratio) => onChange(blocks.map((x) => x.id === b.id ? { ...b, ratio } : x) as T[])} />
                    <Select label="Alineación vertical" value={b.valign} options={{ top: 'Arriba', middle: 'Centro', bottom: 'Abajo' }} onChange={(valign) => onChange(blocks.map((x) => x.id === b.id ? { ...b, valign } : x) as T[])} />
                  </div>
                  {(['left', 'right'] as const).map((side) => (
                    <div key={side} className="bg-secondary/30 grid gap-2 rounded-lg p-2">
                      <p className="text-xs font-semibold">{side === 'left' ? 'Columna izquierda' : 'Columna derecha'}</p>
                      <BlockList compact blocks={b[side]} allowColumns={false} onChange={(children) => onChange(blocks.map((x) => x.id === b.id ? { ...b, [side]: children } : x) as T[])} />
                    </div>
                  ))}
                </div>
              ) : (
                <LeafProperties block={b as LeafBlock} onChange={(nb) => onChange(blocks.map((x) => x.id === b.id ? nb : x) as T[])} />
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <NativeSelect aria-label="Tipo de bloque" value={adding} onChange={(e) => setAdding(e.target.value as Block['type'])} className={compact ? 'h-8 text-xs' : undefined}>
          {types.map((t) => <option key={t} value={t}>{BLOCK_LABELS[t]}</option>)}
        </NativeSelect>
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { const nb = newBlock(adding); onChange([...blocks, nb as T]); setOpen(nb.id) }}>
          <Plus /> Añadir
        </Button>
      </div>
    </div>
  )
}

// --- Editor -------------------------------------------------------------------------------------
export function BlockEditor({ templateId, initialName, initialDesign }: { templateId?: string; initialName: string; initialDesign: BlockDesign }) {
  const [name, setName] = useState(initialName)
  const [design, setDesign] = useState(initialDesign)
  const [dirty, setDirty] = useState(!templateId)
  const [message, setMessage] = useState<{ type: 'error' | 'ok'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const active = useRef<Inserter | null>(null)
  const update = (next: BlockDesign) => { setDesign(next); setDirty(true); setMessage(null) }
  const setTheme = <K extends keyof BlockTheme>(key: K, value: BlockTheme[K]) => update({ ...design, theme: { ...design.theme, [key]: value } })
  const reservation = design.kind === 'reservation'

  const run = (fn: () => Promise<{ error?: string; success?: boolean } | undefined>, ok?: string) => start(async () => {
    const result = await fn()
    if (result?.error) setMessage({ type: 'error', text: result.error })
    else if (result?.success && ok) { setMessage({ type: 'ok', text: ok }); setDirty(false) }
  })
  const save = () => {
    const parsed = blockDesignSchema.safeParse(design)
    if (!name.trim()) return setMessage({ type: 'error', text: 'Ponle un nombre a la plantilla.' })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return setMessage({ type: 'error', text: `Revisa un bloque: ${issue?.message ?? 'dato no válido'}` })
    }
    run(() => saveTemplate(templateId ?? null, { name, description_template: '', design: parsed.data }), 'Plantilla guardada')
  }

  return (
    <InsertContext.Provider value={{ setActive: (fn) => { active.current = fn } }}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="order-2 space-y-6 lg:order-1">
          <Field label="Nombre de la plantilla" htmlFor="tpl-name"><Input id="tpl-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setDirty(true) }} /></Field>
          <p className="bg-secondary/50 rounded-lg p-3 text-xs">
            {reservation ? <><strong>Justificante de reserva.</strong> Úsala en los tipos de eventos con reserva y recogida. El aviso «no es una entrada» se añade siempre arriba y no se puede quitar.</>
              : <><strong>Entrada.</strong> Úsala en los tipos de entrada de eventos con entrada digital.</>}
          </p>

          <fieldset className="grid gap-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Estilo general</legend>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Tipografía" value={design.theme.font} options={Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.label])) as Record<BlockTheme['font'], string>} onChange={(v) => setTheme('font', v)} />
              <Select label="Anchura" value={design.theme.width} options={Object.fromEntries(Object.entries(WIDTHS).map(([k, v]) => [k, v.label])) as Record<BlockTheme['width'], string>} onChange={(v) => setTheme('width', v)} />
              <ColorInput label="Fondo" value={design.theme.backgroundColor} onChange={(v) => setTheme('backgroundColor', v)} />
              <ColorInput label="Texto" value={design.theme.textColor} onChange={(v) => setTheme('textColor', v)} />
              <ColorInput label="Acento" value={design.theme.accentColor} onChange={(v) => setTheme('accentColor', v)} />
              <ColorInput label="Atenuado" value={design.theme.mutedColor} onChange={(v) => setTheme('mutedColor', v)} />
              <ColorInput label="Borde" value={design.theme.borderColor} onChange={(v) => setTheme('borderColor', v)} />
              <Range label="Grosor del borde" value={design.theme.borderWidth} min={0} max={8} onChange={(v) => setTheme('borderWidth', v)} />
              <Range label="Esquinas" value={design.theme.radius} min={0} max={40} onChange={(v) => setTheme('radius', v)} />
              <Range label="Margen interior" value={design.theme.padding} min={8} max={64} onChange={(v) => setTheme('padding', v)} />
            </div>
            <Field label="Imagen de fondo (URL, opcional)" htmlFor="tpl-bg"><Input id="tpl-bg" type="url" placeholder="https://…" value={design.theme.backgroundImageUrl} onChange={(e) => setTheme('backgroundImageUrl', e.target.value)} /></Field>
            {design.theme.backgroundImageUrl && <Range label="Oscurecer la imagen (%)" value={design.theme.overlayOpacity} min={0} max={90} onChange={(v) => setTheme('overlayOpacity', v)} />}
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Bloques</legend>
            <div className="grid gap-1">
              <p className="text-muted-foreground text-xs">Variables: pulsa una para insertarla en el último texto que hayas tocado.</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(VARIABLES[design.kind]).map(([key, label]) => (
                  <button key={key} type="button" title={label} onMouseDown={(e) => e.preventDefault()} onClick={() => active.current?.(`{{${key}}}`)}
                    className="bg-secondary hover:bg-accent/40 rounded-md px-2 py-0.5 font-mono text-xs transition">{`{{${key}}}`}</button>
                ))}
              </div>
            </div>
            <BlockList blocks={design.blocks} allowColumns onChange={(blocks) => update({ ...design, blocks })} />
          </fieldset>

          {message && <p role="status" className={cn('text-sm', message.type === 'error' ? 'text-destructive' : 'text-success')}>{message.text}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || !dirty} onClick={save}>{pending ? 'Guardando…' : templateId ? 'Guardar plantilla' : 'Crear plantilla'}</Button>
            {templateId && <>
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => duplicateTemplate(templateId))}><Copy /> Duplicar</Button>
              <Button type="button" variant="ghost" className="text-destructive" disabled={pending}
                onClick={() => { if (confirm('¿Borrar la plantilla? Los tipos que la usen pasarán al diseño por defecto.')) run(() => deleteTemplate(templateId)) }}><Trash2 /> Borrar</Button>
            </>}
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-20">
            <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">Vista previa · así se verá, se imprimirá y se enviará</p>
            <div className="bg-secondary/60 rounded-2xl border p-3 sm:p-6">
              <BlockCard design={design} qrValue="https://fastpass.example/reserva/ejemplo" shortCode={reservation ? 'B8X8' : 'A7K2'}
                vars={reservation ? reservationVariables(SAMPLE_RESERVATION) : SAMPLE_TICKET_VARS} />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">Datos de ejemplo.</p>
          </div>
        </div>
      </div>
    </InsertContext.Provider>
  )
}
