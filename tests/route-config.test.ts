import { describe, expect, it } from 'vitest'
import { getBackLink, resolveRouteKey } from '@/lib/route-config'

describe('route config helpers', () => {
  it('resolves UUID member detail paths to the dynamic route key', () => {
    expect(resolveRouteKey('/members/123e4567-e89b-12d3-a456-426614174000')).toBe(
      '/members/[id]',
    )
  })

  it('resolves numeric detail paths to the dynamic route key', () => {
    expect(resolveRouteKey('/staff/42')).toBe('/staff/[id]')
  })

  it('returns the admin back link for member detail routes', () => {
    expect(
      getBackLink(
        '/members/123e4567-e89b-12d3-a456-426614174000',
        'admin',
        '/fallback-admin',
      ),
    ).toBe('/members')
  })

  it('returns the staff back link for member detail routes', () => {
    expect(
      getBackLink(
        '/members/123e4567-e89b-12d3-a456-426614174000',
        'staff',
        '/fallback-staff',
      ),
    ).toBe('/trainer/clients')
  })

  it('falls back when the route is not configured', () => {
    expect(getBackLink('/trainer/clients/member-42', 'staff', '/trainer/clients')).toBe(
      '/trainer/clients',
    )
  })
})
