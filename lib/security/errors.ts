const messages: Record<string, string> = {
  FORBIDDEN: 'No autorizado.',
  RATE_LIMITED: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
  DUPLICATE_REGISTRATION: 'Ya existe una solicitud con ese correo para este evento. Contacta con la organización.',
  INVALID_TRANSITION: 'La solicitud ya no está pendiente. Actualiza la página.',
  REGISTRATION_REQUIRED: 'Este evento requiere completar su formulario de inscripción.',
  CODE_SPACE_EXHAUSTED: 'Se ha agotado el espacio de códigos del evento.',
  CODE_RETRY_EXHAUSTED: 'No se pudo asignar un código. Inténtalo de nuevo.',
  INVALID_INPUT: 'Datos no válidos.',
  EVENT_UNAVAILABLE: 'El evento no está disponible.',
  SOLD_OUT: 'No quedan suficientes entradas.',
  SALES_CLOSED: 'La venta de entradas está cerrada.',
  ORDER_LIMIT: 'Se supera el máximo de entradas por pedido.',
  PAYMENTS_NOT_CONFIGURED: 'La venta de entradas de pago todavía no está disponible.',
  CAPACITY_BELOW_SOLD: 'El aforo no puede ser inferior a las entradas emitidas.',
  IDEMPOTENCY_CONFLICT: 'La selección ha cambiado. Recarga la página antes de continuar.',
  RESERVATIONS_NOT_OPEN: 'Las reservas todavía no están abiertas.',
  RESERVATIONS_CLOSED: 'El plazo de reservas ha terminado.',
  PERSON_LIMIT: 'Se supera el máximo por persona para este evento.',
  NOT_FOUND: 'Reserva no encontrada.',
  IDENTITY_CHECK_REQUIRED: 'Con el código de 4 caracteres hay que comprobar la identidad del titular.',
  PAYMENT_NOT_CONFIRMED: 'Confirma que se ha cobrado el importe.',
  RESERVATION_CANCELLED: 'La reserva está cancelada.',
  RESERVATION_EXPIRED: 'La reserva ha caducado: pasó la fecha límite de recogida.',
  ALREADY_COMPLETED: 'Todo lo de esta reserva ya se entregó.',
  ATTENDEES_REQUIRED: 'Faltan datos de alguna persona de la reserva.',
  INVALID_DOCUMENT: 'Algún documento no es válido: revisa el número y la letra.',
  DUPLICATE_DOCUMENT: 'Un mismo documento aparece dos veces o ya tiene una reserva para este evento.',
  AGE_RESTRICTED: 'Alguna persona no tiene la edad mínima para este evento.',
  INVALID_BIRTH_DATE: 'Alguna fecha de nacimiento no es válida.',
  QUANTITY_EXCEEDED: 'La cantidad supera lo pendiente de entregar.',
  QUEUE_REQUIRED: 'Tu turno en la sala de espera ha caducado o no es válido. Vuelve a la cola para reservar.',
  ALREADY_MEMBER: 'Ese correo ya pertenece a un equipo.',
  INVITATION_INVALID: 'La invitación no es válida, ha caducado o es para otro correo.',
  CANNOT_DELETE_SELF: 'Para eliminar tu propia cuenta, ve a «Mi cuenta».',
  LAST_SUPERADMIN: 'Eres el único superadministrador: antes de eliminar tu cuenta, da ese rol a otra persona.',
}

/** Never forward provider diagnostics, SQL, user text or request payloads. */
export function publicError(error: { message?: string; code?: string }) {
  if (['PGRST202','PGRST204','42703'].includes(error.code ?? '')) return 'La base de datos necesita actualizarse. Contacta con el administrador de la plataforma.'
  return messages[error.message ?? ''] ?? (error.code === '42501'
    ? 'No autorizado.' : 'No se pudo completar la operación. Inténtalo de nuevo.')
}
