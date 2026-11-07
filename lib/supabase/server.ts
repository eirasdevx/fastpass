import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { DEMO_MODE } from '@/lib/demo/mode'
import { createDemoClient } from '@/lib/demo/client'
import { authCookieOptions } from '@/lib/security/cookies'

type CookieStore = Awaited<ReturnType<typeof cookies>>

function createSupabaseClient(cookieStore: CookieStore) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component: el proxy refresca la sesión, se puede ignorar
          }
        },
      },
    }
  )
}

export async function createClient() {
  const cookieStore = await cookies()

  if (DEMO_MODE) {
    // Versión beta: mismos métodos que Supabase sobre datos de ejemplo en memoria
    return createDemoClient({
      get: (name) => cookieStore.get(name)?.value,
      set: (name, value) =>
        cookieStore.set(name, value, { ...authCookieOptions, maxAge: 60 * 60 * 24 * 7 }),
      delete: (name) => cookieStore.delete(name),
    }) as unknown as ReturnType<typeof createSupabaseClient>
  }

  return createSupabaseClient(cookieStore)
}
