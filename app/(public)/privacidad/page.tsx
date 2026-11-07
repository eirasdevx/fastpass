import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
export const metadata={title:'Privacidad'}
export default async function Privacy({searchParams}:{searchParams:Promise<{evento?:string}>}){
  const {evento}=await searchParams
  const db=await createClient()
  const {data:event}=z.uuid().safeParse(evento).success?await db.from('events').select('title,privacy_controller,privacy_contact,retention_days').eq('id',evento!).eq('published',true).maybeSingle():{data:null}
  return <article className="mx-auto max-w-2xl space-y-5 px-4 py-12"><h1 className="text-3xl font-bold">Información de privacidad</h1>
    <p>{event?.title??'Selecciona la política enlazada desde el formulario de tu evento para conocer a su responsable.'}</p>
    <h2 className="text-xl font-semibold">Responsable y contacto</h2><p>{event?.privacy_controller||'Pendiente de configurar por la organización.'}<br/>{event?.privacy_contact}</p>
    <h2 className="text-xl font-semibold">Uso de los datos</h2><p>El nombre, apellidos, correo y, cuando se solicite, teléfono se utilizan para tramitar la inscripción, emitir la entrada y gestionar el acceso. El formulario registra la aceptación de esta información. El personal de puerta solo consulta los datos necesarios para identificar y validar la entrada.</p>
    <h2 className="text-xl font-semibold">Conservación y solicitudes</h2><p>El plazo operativo configurado es de {event?.retention_days??90} días después del evento. La organización debe ejecutar y documentar la supresión, salvo las obligaciones de conservación que correspondan. Puedes solicitar acceso, rectificación, exportación o supresión mediante el contacto indicado, acreditando tu identidad por un canal seguro.</p>
    <h2 className="text-xl font-semibold">Enlaces y proveedores</h2><p>El enlace de tu entrada permite consultar su información sin cuenta: no lo compartas públicamente. La plataforma utiliza Supabase para datos y autenticación administrativa, además del proveedor de alojamiento elegido por la organización. Se emplean cookies necesarias para las sesiones administrativas.</p>
  </article>
}
