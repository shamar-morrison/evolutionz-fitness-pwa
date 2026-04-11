import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import { isPublicRoute, isRouteAllowed, type AppRole } from '@/lib/route-config'
import { readStaffProfile } from '@/lib/staff'

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL

  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL')
  }

  return value
}

function getSupabasePublishableKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }

  return value
}

function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }

  return to
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })
  const isPublicPath = isPublicRoute(request.nextUrl.pathname)

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }

        response = NextResponse.next({
          request,
        })

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''

    return copyCookies(response, NextResponse.redirect(loginUrl))
  }

  if (user) {
    const profile = await readStaffProfile(supabase as any, user.id)

    if (!profile) {
      if (typeof supabase.auth.signOut === 'function') {
        await supabase.auth.signOut()
      }

      if (isPublicPath) {
        return response
      }

      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.search = ''

      return copyCookies(response, NextResponse.redirect(loginUrl))
    }

    if (!isPublicPath) {
      const titles = Array.isArray(profile.titles) ? profile.titles : []
      const role: AppRole =
        profile.role === 'admin' || titles.includes('Owner') ? 'admin' : 'staff'

      if (isRouteAllowed(request.nextUrl.pathname, role, titles)) {
        return response
      }

      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = getAuthenticatedHomePath(role, titles)
      redirectUrl.search = ''

      return copyCookies(response, NextResponse.redirect(redirectUrl))
    }

    if (request.nextUrl.pathname !== '/login') {
      return response
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = getAuthenticatedHomePath(profile?.role, profile?.titles)
    redirectUrl.search = ''

    return copyCookies(response, NextResponse.redirect(redirectUrl))
  }

  return response
}
