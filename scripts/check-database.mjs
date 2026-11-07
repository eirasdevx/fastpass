import { createClient } from '@supabase/supabase-js'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if(!url||!key){console.error('Faltan URL o clave pública de Supabase en .env.local.');process.exit(1)}
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const checks=[
  ['0002: columnas de seguridad',()=>db.from('events').select('organization_id,capacity').limit(0)],
  ['0002: permisos con MFA',()=>db.rpc('staff_role')],
  ['0004: opciones de inscripción',()=>db.from('events').select('registration_enabled,status,privacy_controller').limit(0)],
  ['0004: consulta privada',()=>db.rpc('get_entry',{p_token:'0'.repeat(64)})],
]
let failures=0
for(const [label,run] of checks){
  try { const {error}=await run();if(error){failures++;console.error(`${label}: pendiente o inaccesible (${error.code||'red'}).`)}else console.log(`${label}: disponible.`) }
  catch { failures++;console.error(`${label}: no se pudo conectar.`) }
}
console.log('Comprobación de solo lectura; no verifica 0003, configuración de Auth ni despliegue. No se han mostrado credenciales ni consultado asistentes.')
if(failures)process.exitCode=1
