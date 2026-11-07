import { KeyRound, Mail, UserRound } from 'lucide-react'
import { requireStaff } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { createClient } from '@/lib/supabase/server'
import { DatabaseRequired } from '@/components/admin/database-required'
import { PageHeader } from '@/components/admin/page-kit'
import { DeleteOwnAccount } from '@/components/admin/delete-own-account'
import { EmailForm, NameForm, PasswordForm } from '@/components/admin/profile-forms'
export const metadata={title:'Mi cuenta'}

function Panel({icon:Icon,title,description,children}:{icon:typeof Mail;title:string;description?:string;children:React.ReactNode}){
  return <section className="bg-card space-y-5 rounded-2xl border p-5 shadow-xs sm:p-6">
    <div className="flex gap-3"><span className="bg-secondary flex size-10 shrink-0 items-center justify-center rounded-xl"><Icon className="size-5" aria-hidden/></span>
      <div><h2 className="text-lg font-semibold">{title}</h2>{description&&<p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}</div></div>
    {children}
  </section>
}

export default async function Account(){
  const user=await requireStaff();if(DEMO_MODE)return <DatabaseRequired/>
  const {data,error}=await (await createClient()).rpc('own_account_summary')
  if(error)throw new Error('No se pudo cargar tu cuenta. Si acabas de actualizar la aplicación, aplica la migración 0018.')
  const summary=data as {owned_events:string[];last_superadmin:boolean}
  return <div className="max-w-3xl space-y-6">
    <PageHeader title="Mi cuenta" description="Tu nombre, tu correo, tu contraseña y el borrado de la cuenta."/>
    <Panel icon={UserRound} title="Nombre" description="Es el que ve tu equipo y el que aparece en el historial.">
      <NameForm firstName={String(user.user_metadata?.first_name??'')} lastName={String(user.user_metadata?.last_name??'')}/>
    </Panel>
    <Panel icon={Mail} title="Correo electrónico" description="Con él inicias sesión y recibes los avisos de la cuenta.">
      <EmailForm email={user.email??''}/>
    </Panel>
    <Panel icon={KeyRound} title="Contraseña">
      <PasswordForm/>
    </Panel>
    <DeleteOwnAccount email={user.email??''} ownedEvents={summary.owned_events} lastSuperadmin={summary.last_superadmin}/>
  </div>
}
