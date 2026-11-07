const messages: Record<string, string> = {
  weak_password: 'La contraseña es demasiado débil. Usa una más larga o combina letras, números y símbolos.',
  same_password: 'La nueva contraseña debe ser distinta de la anterior.',
  over_email_send_rate_limit: 'Se han enviado demasiados correos. Espera unos minutos antes de volver a intentarlo.',
  over_request_rate_limit: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
  signup_disabled: 'El alta de nuevas cuentas está desactivada. Contacta con el administrador de la plataforma.',
  email_address_invalid: 'Correo electrónico no válido.',
}

/** Traduce los códigos de Supabase Auth sin reenviar nunca su texto original. */
export function authErrorMessage(error: { code?: string }) {
  return messages[error.code ?? ''] ?? 'No se pudo completar la operación. Inténtalo de nuevo.'
}
