'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { templateSchema, type TemplateInput } from '@/lib/validations/template'
import { z } from 'zod'
import { publicError } from '@/lib/security/errors'

type Result = { error?: string; success?: boolean }

export async function saveTemplate(id: string | null, input: TemplateInput): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  if (id !== null && !z.uuid().safeParse(id).success) return { error: 'Datos inválidos' }
  const parsed = templateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()

  if (id) {
    const { error } = await supabase.from('ticket_templates').update(parsed.data).eq('id', id)
    if (error) return { error: publicError(error) }
    revalidatePath('/admin/plantillas')
    revalidatePath(`/admin/plantillas/${id}`)
    revalidatePath('/entradas', 'layout') // las entradas ya emitidas usan el nuevo diseño
    return { success: true }
  }

  const { data, error } = await supabase.from('ticket_templates').insert(parsed.data).select('id').single()
  if (error) return { error: publicError(error) }
  revalidatePath('/admin/plantillas')
  redirect(`/admin/plantillas/${data.id}`)
}

export async function duplicateTemplate(id: string): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  if (!z.uuid().safeParse(id).success) return { error: 'Datos inválidos' }
  const supabase = await createClient()

  const { data: original, error: readError } = await supabase
    .from('ticket_templates')
    .select('name, design, description_template')
    .eq('id', id)
    .single()
  if (readError) return { error: publicError(readError) }

  const { data, error } = await supabase
    .from('ticket_templates')
    .insert({ ...original, name: `${original.name} (copia)`.slice(0, 80) })
    .select('id')
    .single()
  if (error) return { error: publicError(error) }

  revalidatePath('/admin/plantillas')
  redirect(`/admin/plantillas/${data.id}`)
}

export async function deleteTemplate(id: string): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  if (!z.uuid().safeParse(id).success) return { error: 'Datos inválidos' }
  const supabase = await createClient()
  // Los tipos de entrada que la usaban pasan al diseño por defecto (on delete set null)
  const { error } = await supabase.from('ticket_templates').delete().eq('id', id)
  if (error) return { error: publicError(error) }

  revalidatePath('/admin/plantillas')
  revalidatePath('/entradas', 'layout')
  redirect('/admin/plantillas')
}
