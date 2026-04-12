import { describe, expect, it } from 'vitest'

import {
  buildEditMemberRequestPayload,
  hasEditMemberChanges,
  hasEditMemberRequestChanges,
} from '@/components/edit-member-modal'

function createFormState() {
  return {
    name: 'Jane Doe',
    gender: 'Female' as const,
    email: 'jane@example.com',
    phone: '555-0100',
    memberTypeId: 'type-1',
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

  it('returns true when a supported request field changes', () => {
    const initialFormState = createFormState()
    const formData = {
      ...initialFormState,
      phone: '555-0199',
      remark: 'Ignored by request mode',
    }

    expect(hasEditMemberRequestChanges(initialFormState, formData)).toBe(true)
  })

  it('treats normalized request access window values as unchanged', () => {
    const initialFormState = createFormState()
    const formData = {
      ...initialFormState,
      startTime: '00:00',
    }

    expect(hasEditMemberRequestChanges(initialFormState, formData)).toBe(false)
  })

  it('builds a request payload with only changed supported fields', () => {
    const initialFormState = createFormState()
    const formData = {
      ...initialFormState,
      name: 'Jane Updated',
      email: 'jane-updated@example.com',
      remark: 'Ignored by request mode',
    }

    expect(buildEditMemberRequestPayload(initialFormState, formData)).toEqual({
      error: null,
      payload: {
        proposed_name: 'Jane Updated',
        proposed_email: 'jane-updated@example.com',
      },
    })
  })

  it('builds a request payload with only changed access window fields', () => {
    const initialFormState = createFormState()
    const formData = {
      ...initialFormState,
      startTime: '08:30',
      duration: '3_months' as const,
    }

    expect(buildEditMemberRequestPayload(initialFormState, formData)).toEqual({
      error: null,
      payload: {
        proposed_start_time: '08:30:00',
        proposed_duration: '3 Months',
      },
    })
  })

  it('rejects clearing a field in request mode', () => {
    const initialFormState = createFormState()
    const formData = {
      ...initialFormState,
      email: '',
    }

    expect(buildEditMemberRequestPayload(initialFormState, formData)).toEqual({
      error: 'Clearing email is not supported in approval requests.',
      payload: null,
    })
  })

  it('requires a duration when the request changes an unsupported access window', () => {
    const initialFormState = {
      ...createFormState(),
      duration: '' as const,
    }
    const formData = {
      ...initialFormState,
      startTime: '08:30',
    }

    expect(buildEditMemberRequestPayload(initialFormState, formData)).toEqual({
      error: 'Duration required for access window requests.',
      payload: null,
    })
  })
})
