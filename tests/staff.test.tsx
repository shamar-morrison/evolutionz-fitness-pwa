// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OwnerTitleWarning } from '@/components/add-staff-modal'
import {
  deriveRoleFromTitle,
  filterStaffByTitle,
  normalizeStaffSpecialtiesForTitle,
} from '@/lib/staff'
import type { Profile } from '@/types'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'staff-1',
    name: overrides.name ?? 'Admin User',
    email: overrides.email ?? 'admin@evolutionzfitness.com',
    role: overrides.role ?? 'admin',
    title: overrides.title ?? 'Owner',
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

describe('staff helpers', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
  })

  it('renders the owner warning when the selected title is Owner', async () => {
    await act(async () => {
      root.render(<OwnerTitleWarning title="Owner" />)
    })

    expect(container.textContent).toContain('This title grants full admin access to the entire app.')
  })

  it('does not render the owner warning for non-owner titles', async () => {
    await act(async () => {
      root.render(<OwnerTitleWarning title="Trainer" />)
    })

    expect(container.textContent).toBe('')
  })

  it('filters staff by title while leaving All untouched', () => {
    const staff = [
      createProfile({
        id: 'staff-1',
        title: 'Owner',
      }),
      createProfile({
        id: 'staff-2',
        role: 'staff',
        title: 'Trainer',
      }),
      createProfile({
        id: 'staff-3',
        role: 'staff',
        title: 'Reception',
      }),
    ]

    expect(filterStaffByTitle(staff, 'Trainer').map((profile) => profile.id)).toEqual(['staff-2'])
    expect(filterStaffByTitle(staff, 'All').map((profile) => profile.id)).toEqual([
      'staff-1',
      'staff-2',
      'staff-3',
    ])
  })

  it('derives admin access only for the Owner title', () => {
    expect(deriveRoleFromTitle('Owner')).toBe('admin')
    expect(deriveRoleFromTitle('Trainer')).toBe('staff')
  })

  it('keeps trainer specialties in the shared constant order and removes duplicates', () => {
    expect(
      normalizeStaffSpecialtiesForTitle('Trainer', [
        'HIIT',
        'Strength Training',
        'HIIT',
        'Recovery Training',
      ]),
    ).toEqual(['Strength Training', 'HIIT', 'Recovery Training'])
  })

  it('clears specialties for non-trainer titles', () => {
    expect(
      normalizeStaffSpecialtiesForTitle('Owner', ['Strength Training', 'HIIT']),
    ).toEqual([])
  })
})
