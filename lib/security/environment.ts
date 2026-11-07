export function assertSafeEnvironment(env: { NODE_ENV?: string; NEXT_PUBLIC_DEMO_MODE?: string }) {
  if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    throw new Error('El modo demo solo está permitido en desarrollo local. Configura Supabase para producción.')
  }
}
