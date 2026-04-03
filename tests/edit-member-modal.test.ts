import { describe, expect, it } from 'vitest'

import { hasEditMemberChanges } from '@/components/edit-member-modal'

function createFormState() {
  return {
    name: 'Jane Doe',
    gender: 'Female' as const,
    email: 'jane@example.com',
    phone: '555-0100',
    type: 'General' as const,
    remark: 'Existing member',
    startDate: '2026-04-02',
    startTime: '00:00:00',
    duration: '1_month' as const,
  }
}

describe('hasEditMemberChanges', () => {
  it('returns false when the normalized form is unchanged and no photo was selected', () => {
    const initialFormState = createFormState()
    const formData = {
      ...initialFormState,
      name: '  Jane Doe  ',
      email: 'jane@example.com ',
      phone: ' 555-0100 ',
      remark: 'Existing member  ',
    }

    expect(hasEditMemberChanges(initialFormState, formData)).toBe(false)
  })

  it('returns true when a new photo is selected even if the form fields are unchanged', () => {
    const initialFormState = createFormState()

    expect(hasEditMemberChanges(initialFormState, initialFormState, true)).toBe(true)
  })
})
