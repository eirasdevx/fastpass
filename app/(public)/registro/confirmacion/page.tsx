import Link from 'next/link'
export const metadata={title:'Registro recibido',robots:{index:false,follow:false}}
export default function Confirmation(){return <div className="mx-auto max-w-xl space-y-4 px-4 py-12"><h1 className="text-2xl font-bold">Consulta tu inscripción</h1><p>Utiliza el enlace privado que se mostró al enviar el formulario para comprobar si tu solicitud está pendiente o tu entrada ya está emitida.</p><Link href="/" className="underline">Ver eventos</Link></div>}
