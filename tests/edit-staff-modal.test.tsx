// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  createInitialFormState,
  hasEditStaffChanges,
} from '@/components/edit-staff-modal'
import type { StaffFormState } from '@/components/staff-form-fields'
import type { Profile } from '@/types'

function createFormState(overrides: Partial<StaffFormState> = {}): StaffFormState {
  return {
    name: 'Jane Doe',
    email: 'jane@evolutionzfitness.com',
    password: '••••••••',
    confirmPassword: '',
    phone: '876-555-0100',
    gender: 'female',
    remark: 'Existing staff member',
    titles: ['Trainer'],
    specialties: ['Strength Training'],
    ...overrides,
  }
}

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'staff-1',
    name: overrides.name ?? 'Jane Doe',
    email: overrides.email ?? 'jane@evolutionzfitness.com',
    role: overrides.role ?? 'staff',
    titles: overrides.titles ?? ['Trainer'],
    phone: overrides.phone ?? '876-555-0100',
    gender: overrides.gender ?? 'female',
    remark: overrides.remark ?? 'Existing staff member',
    specialties: overrides.specialties ?? ['HIIT', 'Strength Training'],
    photoUrl: overrides.photoUrl ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

describe('hasEditStaffChanges', () => {
  it('prefills trainer specialties from the profile in shared constant order', () => {
    expect(createInitialFormState(createProfile()).specialties).toEqual([
      'Strength Training',
      'HIIT',
    ])
  })

  it('returns false when the normalized editable fields are unchanged and no photo was selected', () => {
    const initialFormState = createFormState()
    const formData = createFormState({
      name: '  Jane Doe  ',
      phone: ' 876-555-0100 ',
      remark: 'Existing staff member  ',
    })

    expect(hasEditStaffChanges(initialFormState, formData)).toBe(false)
  })

  it('returns true when a new photo is selected even if the form fields are unchanged', () => {
    const initialFormState = createFormState()

    expect(hasEditStaffChanges(initialFormState, initialFormState, true)).toBe(true)
  })

  it('returns false when a legacy other gender is unchanged', () => {
    const initialFormState = createFormState({
      gender: 'other',
    })

    expect(hasEditStaffChanges(initialFormState, initialFormState)).toBe(false)
  })

  it('returns true when a legacy other gender is changed', () => {
    const initialFormState = createFormState({
      gender: 'other',
    })
    const formData = createFormState({
      gender: 'female',
    })

    expect(hasEditStaffChanges(initialFormState, formData)).toBe(true)
  })

  it('returns true when the specialties change for a trainer', () => {
    const initialFormState = createFormState()
    const formData = createFormState({
      specialties: ['Strength Training', 'HIIT'],
    })

    expect(hasEditStaffChanges(initialFormState, formData)).toBe(true)
  })
})
