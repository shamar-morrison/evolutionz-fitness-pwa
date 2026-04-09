import type { UserRole } from '@/types'

export type AppRole = UserRole

export interface RouteConfig {
  allowedRoles: AppRole[]
  backLink?: Partial<Record<AppRole, string>>
}

export const routeConfig: Record<string, RouteConfig> = {
  '/members': {
    allowedRoles: ['admin'],
  },
  '/members/[id]': {
    allowedRoles: ['admin', 'staff'],
    backLink: {
      admin: '/members',
      staff: '/trainer/clients',
    },
  },
  '/staff': {
    allowedRoles: ['admin'],
  },
  '/staff/[id]': {
    allowedRoles: ['admin'],
  },
  '/dashboard': {
    allowedRoles: ['admin'],
  },
  '/classes': {
    allowedRoles: ['admin', 'staff'],
  },
  '/classes/[id]': {
    allowedRoles: ['admin', 'staff'],
    backLink: {
      admin: '/classes',
      staff: '/classes',
    },
  },
  '/trainer/schedule': {
    allowedRoles: ['staff'],
  },
  '/trainer/clients': {
    allowedRoles: ['staff'],
  },
  '/trainer/requests': {
    allowedRoles: ['staff'],
  },
  '/pending-approvals': {
    allowedRoles: ['admin'],
  },
  '/reports/pt-payments': {
    allowedRoles: ['admin'],
  },
  '/reports/class-payments': {
    allowedRoles: ['admin'],
  },
}

const uuidSegmentPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const numericSegmentPattern = /^\d+$/

export function resolveRouteKey(pathname: string): string {
  const trimmedPathname =
    pathname === '/' ? pathname : pathname.replace(/\/+$/u, '') || '/'

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

export function getBackLink(
  pathname: string,
  role: AppRole,
  fallback: string,
): string {
  const key = resolveRouteKey(pathname)
  const config = routeConfig[key]

  return config?.backLink?.[role] ?? fallback
}
