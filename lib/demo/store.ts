import 'server-only'
import { isoToLocalInput, localInputToIso } from '@/lib/format'
import { DEFAULT_DESIGN, type TicketDesign } from '@/lib/tickets/design'
import type { Tables } from '@/types/database'
import { DEMO_ADMIN_ID, DEMO_ORDER_TOKEN } from './mode'

export type DemoDb = {
  admins: Tables<'admins'>[]
  ticket_templates: Tables<'ticket_templates'>[]
  events: Tables<'events'>[]
  ticket_types: Tables<'ticket_types'>[]
  orders: (Tables<'orders'> & { request_id?: string; request_payload?: string })[]
  tickets: Tables<'tickets'>[]
}

/** Datos en memoria, compartidos por todo el proceso y reiniciados al arrancar. */
export function getDemoDb(): DemoDb {
  const g = globalThis as typeof globalThis & { __fastpassDemoDb?: DemoDb }
  g.__fastpassDemoDb ??= seed()
  return g.__fastpassDemoDb
}

export function newTicketCode() {
  return crypto.randomUUID().replace(/-/g, '').toUpperCase()
}

// --- Datos de ejemplo --------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000

/** Fecha relativa a hoy, a una hora concreta de Madrid ("21:30"). */
function at(days: number, time: string) {
  const day = isoToLocalInput(new Date(Date.now() + days * DAY).toISOString()).slice(0, 10)
  return localInputToIso(`${day}T${time}`)
}

/** UUID fijo y válido: así los enlaces de ejemplo no cambian entre reinicios. */
function id(kind: string, n: number) {
  return `00000000-0000-4000-8${kind}00-${String(n).padStart(12, '0')}`
}

const TPL = { classic: id('1', 1), neon: id('1', 2), paper: id('1', 3) }
const EV = { jazz: id('2', 1), festival: id('2', 2), ceramics: id('2', 3), comedy: id('2', 4), draft: id('2', 5), past: id('2', 6) }
const TT = {
  jazzGeneral: id('3', 1),
  jazzVip: id('3', 2),
  festDay: id('3', 3),
  festEarly: id('3', 4),
  festVip: id('3', 5),
  ceramics: id('3', 6),
  comedyGeneral: id('3', 7),
  comedyFront: id('3', 8),
  draftGeneral: id('3', 9),
  pastEntry: id('3', 10),
}

const NAMES = [
  'Lucía Fernández', 'Hugo Martín', 'Martina López', 'Pablo Sánchez', 'Sofía García', 'Daniel Romero',
  'Valeria Torres', 'Álvaro Navarro', 'Carmen Ruiz', 'Mateo Domínguez', 'Paula Gil', 'Javier Moreno',
  'Elena Castro', 'Adrián Ortega', 'Irene Delgado', 'Marcos Rubio', 'Noa Molina', 'Diego Serrano',
  'Claudia Ramos', 'Sergio Blanco', 'Alba Vidal', 'Óscar Iglesias', 'Nerea Prieto', 'Iván Herrera',
]

function email(name: string) {
  const local = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.')
  return `${local}@ejemplo.com`
}

function template(
  n: string,
  name: string,
  design: Partial<TicketDesign>,
  description: string
): Tables<'ticket_templates'> {
  const now = new Date(Date.now() - 30 * DAY).toISOString()
  return {
    id: n,
    name,
    organization_id: null,
    design: { ...DEFAULT_DESIGN, ...design },
    description_template: description,
    created_at: now,
    updated_at: now,
  }
}

function seed(): DemoDb {
  const created = new Date(Date.now() - 20 * DAY).toISOString()

  const db: DemoDb = {
    admins: [{ user_id: DEMO_ADMIN_ID, created_at: created }],
    ticket_templates: [
      template(
        TPL.classic,
        'Clásica',
        {},
        '{{tipo}} · {{evento}}\nApertura de puertas 30 minutos antes. ¡Te esperamos, {{asistente}}!'
      ),
      template(
        TPL.neon,
        'Neón festival',
        {
          layout: 'vertical',
          font: 'display',
          backgroundColor: '#0B0A1F',
          textColor: '#F5F3FF',
          accentColor: '#22D3EE',
          radius: 24,
          headline: 'PASE',
          footerText: 'Pulsera en la entrada. No se permite salir y volver a entrar.',
        },
        '{{tipo}} — {{descripcion_tipo}}\n{{fecha}} desde las {{hora}} en {{lugar}}.'
      ),
      template(
        TPL.paper,
        'Papel minimalista',
        {
          layout: 'minimal',
          font: 'serif',
          backgroundColor: '#FAF7F2',
          textColor: '#1C1917',
          accentColor: '#B91C1C',
          radius: 8,
          headline: 'INVITACIÓN',
          footerText: 'Gracias por venir.',
          showPrice: false,
        },
        'Hola, {{asistente}}. Te esperamos el {{fecha}} a las {{hora}}.'
      ),
    ],
    events: [
      {
        id: EV.comedy,
        slug: 'stand-up-risas-de-viernes',
        title: 'Stand-up: Risas de viernes',
        description:
          'Cuatro cómicos, un micro y ninguna piedad. Una hora y media de monólogos para acabar la semana riendo.\n\nRecomendado para mayores de 16 años.',
        venue: 'Sala Clamores · Madrid',
        starts_at: at(2, '22:00'),
        ends_at: at(2, '23:30'),
        cover_url: null,
        latitude: null,
        longitude: null,
        published: true,
        created_at: created,
        updated_at: created,
      },
      {
        id: EV.jazz,
        slug: 'noche-de-jazz-en-el-patio',
        title: 'Noche de jazz en el patio',
        description:
          'El cuarteto de Marta Ibarra presenta su nuevo disco al aire libre, con barra de cócteles y mesas junto al escenario.\n\nSi llueve, el concierto se traslada al auditorio interior.',
        venue: 'Patio del Conde Duque · Madrid',
        starts_at: at(5, '21:30'),
        ends_at: at(5, '23:45'),
        cover_url: null,
        latitude: null,
        longitude: null,
        published: true,
        created_at: created,
        updated_at: created,
      },
      {
        id: EV.ceramics,
        slug: 'taller-de-ceramica-para-principiantes',
        title: 'Taller de cerámica para principiantes',
        description:
          'Aprende a modelar tu primera pieza con torno. Incluye materiales, delantal y cocción de la pieza (la recoges a las dos semanas).\n\nPlazas muy limitadas.',
        venue: 'Estudio Barro · Valencia',
        starts_at: at(9, '11:00'),
        ends_at: at(9, '13:30'),
        cover_url: null,
        latitude: null,
        longitude: null,
        published: true,
        created_at: created,
        updated_at: created,
      },
      {
        id: EV.festival,
        slug: 'festival-indie-primavera',
        title: 'Festival Indie Primavera',
        description:
          'Doce bandas en dos escenarios, food trucks y zona chill-out. El cartel completo se anuncia la semana que viene.',
        venue: 'Parque Tierno Galván · Madrid',
        starts_at: at(20, '17:00'),
        ends_at: at(20, '23:59'),
        cover_url: null,
        latitude: null,
        longitude: null,
        published: true,
        created_at: created,
        updated_at: created,
      },
      {
        id: EV.draft,
        slug: 'concierto-acustico-de-otono',
        title: 'Concierto acústico de otoño',
        description: 'Borrador: falta confirmar el lugar y el precio.',
        venue: '',
        starts_at: at(40, '20:00'),
        ends_at: null,
        cover_url: null,
        latitude: null,
        longitude: null,
        published: false,
        created_at: created,
        updated_at: created,
      },
      {
        id: EV.past,
        slug: 'mercadillo-vintage',
        title: 'Mercadillo vintage',
        description: 'Ropa, vinilos y muebles de segunda mano. Más de 40 puestos.',
        venue: 'Nave 16 · Matadero Madrid',
        starts_at: at(-10, '10:00'),
        ends_at: at(-10, '20:00'),
        cover_url: null,
        latitude: null,
        longitude: null,
        published: true,
        created_at: created,
        updated_at: created,
      },
    ].map((event) => ({ ...event, organization_id: null, capacity: null })),
    ticket_types: [],
    orders: [],
    tickets: [],
  }

  const type = (
    typeId: string,
    eventId: string,
    name: string,
    price: number,
    capacity: number | null,
    templateId: string | null,
    extra: Partial<Tables<'ticket_types'>> = {}
  ) =>
    db.ticket_types.push({
      id: typeId,
      event_id: eventId,
      name,
      description: '',
      price,
      capacity,
      max_per_order: 10,
      template_id: templateId,
      sales_open: true,
      created_at: created,
      ...extra,
    })

  type(TT.comedyGeneral, EV.comedy, 'General', 12, 180, TPL.classic, { max_per_order: 8 })
  type(TT.comedyFront, EV.comedy, 'Primera fila', 20, 20, TPL.classic, {
    description: 'Asientos en las dos primeras filas. Riesgo alto de que te pregunten a ti.',
    max_per_order: 4,
  })
  type(TT.jazzGeneral, EV.jazz, 'General', 18, 150, TPL.classic, {
    description: 'Acceso al patio, de pie o en gradas.',
    max_per_order: 6,
  })
  type(TT.jazzVip, EV.jazz, 'Mesa VIP', 45, 20, TPL.neon, {
    description: 'Mesa junto al escenario con un cóctel incluido.',
    max_per_order: 4,
  })
  type(TT.ceramics, EV.ceramics, 'Plaza en el taller', 0, 12, TPL.paper, {
    description: 'Una plaza por persona. Materiales incluidos.',
    max_per_order: 2,
  })
  type(TT.festDay, EV.festival, 'Abono de día', 35, 1500, TPL.neon, { description: 'Acceso a los dos escenarios.' })
  type(TT.festEarly, EV.festival, 'Early bird', 25, 150, TPL.neon, {
    description: 'Precio especial de lanzamiento.',
    sales_open: false,
  })
  type(TT.festVip, EV.festival, 'VIP', 80, 100, TPL.neon, {
    description: 'Zona VIP con barra propia y aseos exclusivos.',
    max_per_order: 4,
  })
  type(TT.draftGeneral, EV.draft, 'General', 15, 80, null)
  type(TT.pastEntry, EV.past, 'Entrada', 3, null, TPL.paper)

  let orderN = 0
  let nameN = 0

  /** Añade pedidos hasta emitir `count` entradas del tipo indicado. */
  function sell(
    eventId: string,
    typeId: string,
    count: number,
    opts: { used?: number; cancelled?: number; token?: string; buyer?: string } = {}
  ) {
    let issued = 0
    while (issued < count) {
      const qty = opts.buyer ? count : Math.min(1 + (orderN % 3), count - issued)
      const buyer = opts.buyer ?? NAMES[nameN++ % NAMES.length]
      const orderId = id('4', ++orderN)
      const createdAt = new Date(Date.now() - ((orderN * 7) % 15) * DAY - orderN * 3_600_000).toISOString()
      db.orders.push({
        id: orderId,
        event_id: eventId,
        buyer_name: buyer,
        buyer_email: email(buyer),
        access_token: opts.token ?? id('f', 100 + orderN),
        created_at: createdAt,
      })
      for (let i = 0; i < qty; i++, issued++) {
        const used = issued < (opts.used ?? 0)
        const cancelled = !used && issued >= count - (opts.cancelled ?? 0)
        db.tickets.push({
          id: id('5', db.tickets.length + 1),
          code: newTicketCode(),
          order_id: orderId,
          event_id: eventId,
          ticket_type_id: typeId,
          attendee_name: buyer,
          status: used ? 'used' : cancelled ? 'cancelled' : 'valid',
          used_at: used ? at(-10, `1${issued % 10}:${String((issued * 7) % 60).padStart(2, '0')}`) : null,
          validated_by: used ? DEMO_ADMIN_ID : null,
          created_at: createdAt,
        })
      }
    }
  }

  // Pedido que se enlaza desde el aviso de la beta
  sell(EV.jazz, TT.jazzGeneral, 2, { token: DEMO_ORDER_TOKEN, buyer: 'Lucía Fernández' })
  const demoOrder = db.orders[db.orders.length - 1]
  db.tickets.push({
    id: id('5', db.tickets.length + 1),
    code: newTicketCode(),
    order_id: demoOrder.id,
    event_id: EV.jazz,
    ticket_type_id: TT.jazzVip,
    attendee_name: demoOrder.buyer_name,
    status: 'valid',
    used_at: null,
    validated_by: null,
    created_at: demoOrder.created_at,
  })
  sell(EV.jazz, TT.jazzGeneral, 38)
  sell(EV.jazz, TT.jazzVip, 14)
  sell(EV.comedy, TT.comedyGeneral, 64, { cancelled: 2 })
  sell(EV.comedy, TT.comedyFront, 20) // agotada
  sell(EV.ceramics, TT.ceramics, 10) // quedan 2
  sell(EV.festival, TT.festDay, 212)
  sell(EV.festival, TT.festEarly, 150)
  sell(EV.festival, TT.festVip, 31)
  sell(EV.past, TT.pastEntry, 46, { used: 39 })

  return db
}
