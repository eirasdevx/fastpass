import { Database } from 'lucide-react'
import { EmptyState } from '@/components/admin/page-kit'

export function DatabaseRequired(){
  return <EmptyState icon={Database} title="Esta sección necesita la base de datos"
    description="En la versión de demostración no se simula. Configura Supabase (URL y clave pública), aplica las migraciones y desactiva NEXT_PUBLIC_DEMO_MODE. Los eventos, plantillas y pedidos de la demo siguen disponibles en sus pantallas."/>
}
