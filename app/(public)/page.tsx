import { createClient } from '@/lib/supabase/server'
import { isoHoursAgo } from '@/lib/format'
import { EventDiscovery } from '@/components/public/event-discovery'

export default async function HomePage() {
  const supabase = await createClient()
  // Eventos publicados que no terminaron hace más de 12 horas
  const cutoff = isoHoursAgo(12)

  const { data: events, error } = await supabase
    .from('events')
    .select('id, slug, title, venue, starts_at, cover_url')
    .eq('published', true)
    .gte('starts_at', cutoff)
    .order('starts_at', { ascending: true })

  if (error) throw new Error('No se pudo cargar la información.')

  return <EventDiscovery events={events} />
}
