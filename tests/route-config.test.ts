import { describe, expect, it } from 'vitest'
import {
  getBackLink,
  isPublicRoute,
  isRouteAllowed,
  resolveRouteKey,
  routeConfig,
} from '@/lib/route-config'

describe('route config helpers', () => {
  it('resolves UUID member detail paths to the dynamic route key', () => {
    expect(resolveRouteKey('/members/123e4567-e89b-12d3-a456-426614174000')).toBe(
      '/members/[id]',
    )
  })

  it('resolves numeric detail paths to the dynamic route key', () => {
    expect(resolveRouteKey('/staff/42')).toBe('/staff/[id]')
  })

  it('allows admins on every configured route regardless of titles', () => {
    for (const pathname of Object.keys(routeConfig)) {
      expect(isRouteAllowed(pathname, 'admin', [])).toBe(true)
      expect(isRouteAllowed(pathname, 'admin', ['Mystery Role'])).toBe(true)
    }
  })

  it('allows trainers on trainer pages, classes, and member detail pages only', () => {
    expect(isRouteAllowed('/trainer/schedule', 'staff', ['Trainer'])).toBe(true)
    expect(isRouteAllowed('/trainer/clients', 'staff', ['Trainer'])).toBe(true)
    expect(isRouteAllowed('/trainer/requests', 'staff', ['Trainer'])).toBe(true)
    expect(isRouteAllowed('/classes', 'staff', ['Trainer'])).toBe(true)
    expect(isRouteAllowed('/classes/123', 'staff', ['Trainer'])).toBe(true)
    expect(
      isRouteAllowed(
        '/members/123e4567-e89b-12d3-a456-426614174000',
        'staff',
        ['Trainer'],
      ),
    ).toBe(true)

    expect(isRouteAllowed('/members', 'staff', ['Trainer'])).toBe(false)
    expect(isRouteAllowed('/dashboard', 'staff', ['Trainer'])).toBe(false)
    expect(isRouteAllowed('/reports/pt-payments', 'staff', ['Trainer'])).toBe(false)
    expect(isRouteAllowed('/reports/class-payments', 'staff', ['Trainer'])).toBe(false)
    expect(isRouteAllowed('/reports/revenue', 'staff', ['Trainer'])).toBe(false)
  })

  it('allows administrative assistants on members and classes but not trainer or admin pages', () => {
    expect(isRouteAllowed('/members', 'staff', ['Administrative Assistant'])).toBe(true)
    expect(
      isRouteAllowed(
        '/members/123e4567-e89b-12d3-a456-426614174000',
        'staff',
        ['Administrative Assistant'],
      ),
    ).toBe(true)
    expect(isRouteAllowed('/classes', 'staff', ['Administrative Assistant'])).toBe(true)
    expect(isRouteAllowed('/classes/123', 'staff', ['Administrative Assistant'])).toBe(true)

    expect(isRouteAllowed('/dashboard', 'staff', ['Administrative Assistant'])).toBe(false)
    expect(isRouteAllowed('/staff', 'staff', ['Administrative Assistant'])).toBe(false)
    expect(isRouteAllowed('/reports/pt-payments', 'staff', ['Administrative Assistant'])).toBe(
      false,
    )
    expect(isRouteAllowed('/reports/class-payments', 'staff', ['Administrative Assistant'])).toBe(
      false,
    )
    expect(isRouteAllowed('/reports/revenue', 'staff', ['Administrative Assistant'])).toBe(false)
    expect(isRouteAllowed('/trainer/schedule', 'staff', ['Administrative Assistant'])).toBe(
      false,
    )
    expect(isRouteAllowed('/trainer/clients', 'staff', ['Administrative Assistant'])).toBe(false)
  })

  it('denies unknown titles on staff-restricted routes', () => {
    expect(isRouteAllowed('/members', 'staff', ['Mystery Role'])).toBe(false)
    expect(isRouteAllowed('/trainer/schedule', 'staff', ['Mystery Role'])).toBe(false)
    expect(isRouteAllowed('/classes', 'staff', ['Mystery Role'])).toBe(false)
  })

  it('returns false when staff does not have a matching title on a restricted route', () => {
    expect(isRouteAllowed('/members', 'staff', ['Assistant'])).toBe(false)
    expect(isRouteAllowed('/trainer/requests', 'staff', ['Medical'])).toBe(false)
  })

  it('marks auth recovery routes as public', () => {
    expect(isPublicRoute('/login')).toBe(true)
    expect(isPublicRoute('/forgot-password')).toBe(true)
    expect(isPublicRoute('/auth/reset-password')).toBe(true)
    expect(isPublicRoute('/dashboard')).toBe(false)
  })

  it('inherits access rules from the nearest configured parent route', () => {
    expect(isRouteAllowed('/pending-approvals/session-updates', 'admin', ['Owner'])).toBe(true)
    expect(isRouteAllowed('/pending-approvals/session-updates', 'staff', ['Trainer'])).toBe(
      false,
    )
    expect(isRouteAllowed('/pending-approvals/member-requests', 'staff', ['Trainer'])).toBe(
      false,
    )
  })

  it('returns an accessible admin back link for member detail routes', () => {
    expect(
      getBackLink(
        '/members/123e4567-e89b-12d3-a456-426614174000',
        'admin',
        ['Owner'],
        '/fallback-admin',
      ),
    ).toBe('/members')
  })

  it('returns an accessible staff back link for administrative assistants', () => {
    expect(
      getBackLink(
        '/members/123e4567-e89b-12d3-a456-426614174000',
        'staff',
        ['Administrative Assistant'],
        '/trainer/schedule',
      ),
    ).toBe('/members')
  })

  it('never resolves back links to routes the staff user cannot access', () => {
    expect(
      getBackLink(
        '/members/123e4567-e89b-12d3-a456-426614174000',
        'staff',
        ['Trainer'],
        '/trainer/schedule',
      ),
    ).toBe('/trainer/schedule')

    expect(
      getBackLink('/trainer/clients/member-42', 'staff', ['Assistant'], '/trainer/clients'),
    ).toBe('/unauthorized')
  })

  it('keeps the admin-only report and settings routes configured', () => {
    expect(routeConfig['/reports/pt-payments']?.allowedRoles).toEqual(['admin'])
    expect(routeConfig['/reports/class-payments']?.allowedRoles).toEqual(['admin'])
    expect(routeConfig['/reports/revenue']?.allowedRoles).toEqual(['admin'])
    expect(routeConfig['/settings']?.allowedRoles).toEqual(['admin'])
    expect(routeConfig['/reports']).toBeUndefined()
  })
})
