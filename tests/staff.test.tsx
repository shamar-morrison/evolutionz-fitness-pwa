// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OwnerTitleWarning } from '@/components/add-staff-modal'
import {
  deriveRoleFromTitles,
  filterStaffByTitle,
  isFrontDeskStaff,
  normalizeStaffSpecialtiesForTitles,
} from '@/lib/staff'
import type { Profile } from '@/types'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'staff-1',
    name: overrides.name ?? 'Admin User',
    email: overrides.email ?? 'admin@evolutionzfitness.com',
    role: overrides.role ?? 'admin',
    titles: overrides.titles ?? ['Owner'],
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
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

  it('renders the owner warning when the selected titles include Owner', async () => {
    await act(async () => {
      root.render(<OwnerTitleWarning titles={['Owner']} />)
    })

    expect(container.textContent).toContain('The "Owner" title grants full access to the entire app.')
  })

  it('does not render the owner warning when the selected titles omit Owner', async () => {
    await act(async () => {
      root.render(<OwnerTitleWarning titles={['Trainer']} />)
    })

    expect(container.textContent).toBe('')
  })

  it('filters staff by matching titles while leaving All untouched', () => {
    const staff = [
      createProfile({
        id: 'staff-1',
        titles: ['Owner'],
      }),
      createProfile({
        id: 'staff-2',
        role: 'staff',
        titles: ['Trainer', 'Assistant'],
      }),
      createProfile({
        id: 'staff-3',
        role: 'staff',
        titles: ['Assistant'],
      }),
    ]

    expect(filterStaffByTitle(staff, 'Trainer').map((profile) => profile.id)).toEqual(['staff-2'])
    expect(filterStaffByTitle(staff, 'Assistant').map((profile) => profile.id)).toEqual([
      'staff-2',
      'staff-3',
    ])
    expect(filterStaffByTitle(staff, 'All').map((profile) => profile.id)).toEqual([
      'staff-1',
      'staff-2',
      'staff-3',
    ])
  })

  it('derives admin access only when the titles include Owner', () => {
    expect(deriveRoleFromTitles(['Owner'])).toBe('admin')
    expect(deriveRoleFromTitles(['Trainer'])).toBe('staff')
    expect(deriveRoleFromTitles(['Trainer', 'Owner'])).toBe('admin')
  })

  it('keeps trainer specialties in the shared constant order and removes duplicates', () => {
    expect(
      normalizeStaffSpecialtiesForTitles(['Trainer'], [
        'HIIT',
        'Strength Training',
        'HIIT',
        'Recovery Training',
      ]),
    ).toEqual(['Strength Training', 'HIIT', 'Recovery Training'])
  })

  it('clears specialties when the titles do not include Trainer', () => {
    expect(
      normalizeStaffSpecialtiesForTitles(['Owner'], ['Strength Training', 'HIIT']),
    ).toEqual([])
  })

  it('does not treat trainer assistants as front desk staff', () => {
    expect(isFrontDeskStaff(['Trainer', 'Assistant'])).toBe(false)
  })

  it('treats front desk-only titles as front desk staff', () => {
    expect(isFrontDeskStaff(['Administrative Assistant'])).toBe(true)
  })
})
