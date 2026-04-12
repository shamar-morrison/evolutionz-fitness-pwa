import type { UserRole } from '@/types'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'

export type AppRole = UserRole
export type AppTitle =
  | 'Owner'
  | 'Trainer'
  | 'Administrative Assistant'
  | 'Assistant'
  | 'Medical'
  | 'Physiotherapist/Nutritionist'

export interface RouteConfig {
  allowedRoles: AppRole[]
  allowedTitles?: AppTitle[]
  backLink?: Partial<Record<AppRole, string>>
}

export const publicRoutes = ['/login', '/forgot-password', '/auth/reset-password'] as const

export const routeConfig: Record<string, RouteConfig> = {
  '/dashboard': {
    allowedRoles: ['admin'],
  },
  '/members': {
    allowedRoles: ['admin', 'staff'],
    allowedTitles: ['Administrative Assistant', 'Assistant'],
  },
  '/members/[id]': {
    allowedRoles: ['admin', 'staff'],
    allowedTitles: ['Trainer', 'Administrative Assistant', 'Assistant'],
    backLink: {
      admin: '/members',
      staff: '/members',
    },
  },
  '/staff': {
    allowedRoles: ['admin'],
  },
  '/staff/[id]': {
    allowedRoles: ['admin'],
  },
  '/email': {
    allowedRoles: ['admin'],
  },
  '/classes': {
    allowedRoles: ['admin', 'staff'],
    allowedTitles: ['Trainer', 'Administrative Assistant', 'Assistant'],
  },
  '/classes/[id]': {
    allowedRoles: ['admin', 'staff'],
    allowedTitles: ['Trainer', 'Administrative Assistant', 'Assistant'],
    backLink: {
      admin: '/classes',
      staff: '/classes',
    },
  },
  '/schedule': {
    allowedRoles: ['admin'],
  },
  '/reports': {
    allowedRoles: ['admin'],
  },
  '/reports/pt-payments': {
    allowedRoles: ['admin'],
  },
  '/reports/class-payments': {
    allowedRoles: ['admin'],
  },
  '/reports/revenue': {
    allowedRoles: ['admin'],
  },
  '/settings': {
    allowedRoles: ['admin'],
  },
  '/pending-approvals': {
    allowedRoles: ['admin'],
  },
  '/pending-approvals/edit-requests': {
    allowedRoles: ['admin'],
  },
  '/pending-approvals/payment-requests': {
    allowedRoles: ['admin'],
  },
  '/trainer/schedule': {
    allowedRoles: ['admin', 'staff'],
    allowedTitles: ['Trainer'],
  },
  '/trainer/clients': {
    allowedRoles: ['admin', 'staff'],
    allowedTitles: ['Trainer'],
  },
  '/trainer/requests': {
    allowedRoles: ['admin', 'staff'],
    allowedTitles: ['Trainer'],
  },
}

const uuidSegmentPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const numericSegmentPattern = /^\d+$/

function normalizePathname(pathname: string) {
  return pathname === '/' ? pathname : pathname.replace(/\/+$/u, '') || '/'
}

function normalizeTitles(titles: string[]): AppTitle[] {
  const allowedTitles = new Set<AppTitle>([
    'Owner',
    'Trainer',
    'Administrative Assistant',
    'Assistant',
    'Medical',
    'Physiotherapist/Nutritionist',
  ])

  return titles.filter((title): title is AppTitle => allowedTitles.has(title as AppTitle))
}

function getDefaultHomePath(role: AppRole, titles: string[]) {
  return getAuthenticatedHomePath(role, titles)
}

function getRouteConfig(pathname: string): RouteConfig | undefined {
  let key = resolveRouteKey(pathname)

  while (true) {
    const config = routeConfig[key]

    if (config) {
      return config
    }

    if (key === '/') {
      return undefined
    }

    const parentIndex = key.lastIndexOf('/')

    if (parentIndex <= 0) {
      key = '/'
      continue
    }

    key = key.slice(0, parentIndex)
  }
}

export function resolveRouteKey(pathname: string): string {
  const trimmedPathname = normalizePathname(pathname)

  return trimmedPathname
    .split('/')
    .map((segment, index) => {
      if (index === 0) {
        return segment
      }

      if (uuidSegmentPattern.test(segment) || numericSegmentPattern.test(segment)) {
        return '[id]'
      }

      return segment
    })
    .join('/')
}

export function isPublicRoute(pathname: string): boolean {
  const routeKey = resolveRouteKey(pathname)

  return publicRoutes.includes(routeKey as (typeof publicRoutes)[number])
}

export function isRouteAllowed(
  pathname: string,
  role: AppRole,
  titles: string[],
): boolean {
  const config = getRouteConfig(pathname)

  if (!config) {
    return true
  }

  if (role === 'admin') {
    return true
  }

  if (!config.allowedRoles.includes(role)) {
    return false
  }

  if (!config.allowedTitles || config.allowedTitles.length === 0) {
    return true
  }

  const normalizedTitles = normalizeTitles(titles)

  return normalizedTitles.some((title) => config.allowedTitles?.includes(title))
}

export function getBackLink(
  pathname: string,
  role: AppRole,
  titles: string[],
  fallback: string,
): string {
  const config = getRouteConfig(pathname)
  const configuredBackLink = config?.backLink?.[role]

  if (configuredBackLink && isRouteAllowed(configuredBackLink, role, titles)) {
    return configuredBackLink
  }

  if (isRouteAllowed(fallback, role, titles)) {
    return fallback
  }

  return getDefaultHomePath(role, titles)
}
