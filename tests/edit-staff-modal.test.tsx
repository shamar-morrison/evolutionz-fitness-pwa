import { describe, expect, it } from 'vitest'
import { hasEditStaffChanges } from '@/components/edit-staff-modal'
import type { StaffFormState } from '@/components/staff-form-fields'

function createFormState(overrides: Partial<StaffFormState> = {}): StaffFormState {
  return {
    name: 'Jane Doe',
    email: 'jane@evolutionzfitness.com',
    password: '••••••••',
    phone: '876-555-0100',
    gender: 'female',
    remark: 'Existing staff member',
    title: 'Trainer',
    ...overrides,
  }
}

describe('hasEditStaffChanges', () => {
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
})
