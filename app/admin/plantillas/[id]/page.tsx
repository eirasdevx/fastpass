import { requireAdmin } from '@/lib/auth'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parseDesign } from '@/lib/tickets/design'
import { TemplateEditor } from '@/components/admin/template-editor'
import { BlockEditor } from '@/components/admin/block-editor'
import { ConvertTemplateButton } from '@/components/admin/convert-template-button'
import { parseBlockDesign } from '@/lib/tickets/blocks'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/admin/page-kit'

export const metadata: Metadata = { title: 'Editar plantilla' }

export default async function EditTemplatePage(props: PageProps<'/admin/plantillas/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const supabase = await createClient()
  const { data: template, error } = await supabase
    .from('ticket_templates')
    .select('id, name, design, description_template')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error('No se pudo cargar la información.')
  if (!template) notFound()
  const blocks = parseBlockDesign(template.design)

  return (
    <div className="space-y-6">
      <Link href="/admin/plantillas" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"><ChevronLeft className="size-4" aria-hidden />Plantillas</Link>
      <PageHeader title={template.name} description="Los cambios se aplican a todas las entradas o justificantes que usan esta plantilla." />
      {/* key: si se duplica o se guarda, el formulario arranca con los datos nuevos */}
      {blocks ? (
        <BlockEditor key={template.id} templateId={template.id} initialName={template.name} initialDesign={blocks} />
      ) : (<>
      <ConvertTemplateButton id={template.id} name={template.name} design={parseDesign(template.design)} descriptionTemplate={template.description_template} />
      <TemplateEditor
        key={template.id}
        templateId={template.id}
        defaultValues={{
          name: template.name,
          design: parseDesign(template.design),
          description_template: template.description_template,
        }}
      />
      </>)}
    </div>
  )
}
