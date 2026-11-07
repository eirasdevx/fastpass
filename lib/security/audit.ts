import 'server-only'

export type SecurityEvent = 'access_denied' | 'login_failed' | 'database_error' | 'mfa_failed'

/** Fixed vocabulary only: no request objects, identity, URL, token, email or provider errors. */
export function audit(event: SecurityEvent) {
  console.warn(JSON.stringify({ category: 'security', event }))
}
