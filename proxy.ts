import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_MODE, DEMO_SESSION_COOKIE } from '@/lib/demo/mode'
import { authCookieOptions } from '@/lib/security/cookies'
import { contentSecurityPolicy } from '@/lib/security/headers'

function redirectToLogin(request: NextRequest) {
  const url = new URL('/login', request.url)
  url.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

// Next.js 16: `middleware.ts` pasa a llamarse `proxy.ts`.
// Refresca la sesión de Supabase en cada petición y protege /admin.
export async function proxy(request: NextRequest) {
  // btoa en vez de Buffer: funciona igual en Node y en entornos edge (p. ej. Netlify).
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production', process.env.NEXT_PUBLIC_SUPABASE_URL)
  request.headers.set('Content-Security-Policy', csp)
  request.headers.set('x-nonce', nonce)
  const protect = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', csp)
    // All current pages read auth cookies. Never cache responses containing tokens or Set-Cookie.
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    if (/^\/(entrada|entradas|reserva|admin)(\/|$)/.test(request.nextUrl.pathname)) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    }
    return response
  }
  if (DEMO_MODE) {
    // Versión beta: la "sesión" es una cookie; requireAdmin hace el resto
    if (!request.cookies.has(DEMO_SESSION_COOKIE) && request.nextUrl.pathname.startsWith('/admin') && request.nextUrl.pathname !== '/admin/login') {
      return protect(redirectToLogin(request))
    }
    return protect(NextResponse.next({ request }))
  }

  let response = NextResponse.next({ request })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return protect(new NextResponse('Servicio no configurado.', { status: 503 }))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() valida contra Supabase; getSession() no.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (request.nextUrl.pathname === '/admin/login') return protect(NextResponse.redirect(new URL('/login', request.url)))
  if (!user && request.nextUrl.pathname.startsWith('/admin')) {
    const redirect = redirectToLogin(request)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return protect(redirect)
  }

  return protect(response)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
