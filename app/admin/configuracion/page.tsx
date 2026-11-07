import Link from 'next/link'
import { ShieldCheck, UserPlus, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { DatabaseRequired } from '@/components/admin/database-required'
import { StaffForm } from '@/components/admin/staff-form'
import { InviteForm, PendingInvitations, TeamTable, type PendingInvitation, type TeamMember } from '@/components/admin/team-manager'
import { PageHeader } from '@/components/admin/page-kit'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { staffEvents } from '@/lib/admin-data'
export const metadata={title:'Configuración'}

function Panel({icon:Icon,title,description,children}:{icon:typeof Users;title:string;description:React.ReactNode;children:React.ReactNode}){
  return <section className="bg-card space-y-5 rounded-2xl border p-5 shadow-xs sm:p-6">
    <div className="flex gap-3"><span className="bg-secondary flex size-10 shrink-0 items-center justify-center rounded-xl"><Icon className="size-5" aria-hidden/></span>
      <div><h2 className="text-lg font-semibold">{title}</h2><p className="text-muted-foreground mt-0.5 text-sm">{description}</p></div></div>
    {children}
  </section>
}

export default async function Settings(){
  const admin=await requireAdmin();if(DEMO_MODE)return <DatabaseRequired/>
  const db=await createClient(),superadmin=admin.role==='admin'
  const [events,orgs,team,invitations]=await Promise.all([staffEvents(),db.from('organizations').select('id,name').order('name'),db.rpc('list_team'),
    db.from('invitations').select('id,email,role,organization_id,event_id,expires_at').is('accepted_at',null).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false})])
  if(orgs.error)throw new Error('No se pudo cargar la configuración.')
  if(team.error||invitations.error)throw new Error('No se pudo cargar el equipo. Si acabas de actualizar la aplicación, aplica la migración 0016.')
  const orgName=(id:string)=>orgs.data?.find(o=>o.id===id)?.name??''
  const pending:PendingInvitation[]=(invitations.data??[]).map(i=>({id:i.id,email:i.email,role:i.role,organization:orgName(i.organization_id),event_title:events.find(e=>e.id===i.event_id)?.title??null,expires_at:i.expires_at}))
  const members=(team.data as unknown as TeamMember[])??[]
  return <div className="max-w-4xl space-y-6">
    <PageHeader title="Configuración" description="Tu equipo, sus permisos y la privacidad de los datos."
      actions={<Badge variant="success" className="gap-1.5 px-2.5 py-1"><ShieldCheck aria-hidden/>{superadmin?'Superadministrador':'Administrador'} · verificación en dos pasos</Badge>}/>
    <Panel icon={UserPlus} title="Invitar a una persona" description={<>Crea un enlace y envíaselo. Al abrirlo, la persona crea su cuenta con ese correo y entra en {superadmin?'el equipo elegido':'tu equipo'}. <strong>Control de acceso</strong> solo valida entradas y entrega reservas; <strong>Administrador</strong> gestiona eventos, asistentes y el equipo.</>}>
      <InviteForm superadmin={superadmin} organizations={orgs.data??[]} events={events.map(e=>({id:e.id,title:e.title,organization_id:e.organization_id}))}/>
      <PendingInvitations invitations={pending}/>
    </Panel>
    <Panel icon={Users} title={`Equipo · ${members.length}`} description="Al eliminar una cuenta, la persona deja de poder entrar. Si es la única administradora de su equipo, sus eventos se eliminan con ella; antes de confirmar verás cuáles.">
      <TeamTable superadmin={superadmin} members={members}/>
      {superadmin&&<details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Avanzado: autorizar una cuenta existente por su identificador</summary><div className="mt-4"><StaffForm organizations={orgs.data??[]} events={events}/></div></details>}
    </Panel>
    <Panel icon={ShieldCheck} title="Privacidad y conservación" description="Configura en cada evento el responsable, el contacto y el plazo de conservación. Los datos personales se borran solos al terminar ese plazo.">
      <p className="text-muted-foreground text-sm">Los pedidos antiguos y sus obligaciones de conservación se gestionan mediante el procedimiento de operador documentado. La depuración de copias de seguridad y los contratos con proveedores deben revisarse antes de producción.</p>
      <Link className="text-sm font-medium underline" href="/admin/eventos">Configurar eventos →</Link>
    </Panel>
  </div>
}
