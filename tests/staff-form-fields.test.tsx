// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StaffFormFields, type StaffFormState } from '@/components/staff-form-fields'

function createFormState(overrides: Partial<StaffFormState> = {}): StaffFormState {
  return {
    name: 'Jane Doe',
    email: 'jane@evolutionzfitness.com',
    password: 'password123',
    phone: '876-555-0100',
    gender: '',
    remark: '',
    title: 'Trainer',
    ...overrides,
  }
}

function StaffFormFieldsHarness({
  initialFormState,
  mode,
}: {
  initialFormState: StaffFormState
  mode: 'add' | 'edit'
}) {
  const [formData, setFormData] = useState(initialFormState)

  return (
    <>
      <StaffFormFields
        idPrefix="staff-test"
        mode={mode}
        formData={formData}
        setFormData={setFormData}
        setPhotoFile={() => {}}
        isSubmitting={false}
      />
      <output data-testid="gender-state">{formData.gender || 'empty'}</output>
    </>
  )
}

function getGenderState(container: HTMLDivElement) {
  const output = container.querySelector('[data-testid="gender-state"]')

  if (!(output instanceof HTMLOutputElement)) {
    throw new Error('Gender state output not found.')
  }

  return output.textContent
}

function getButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

describe('StaffFormFields', () => {
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

  it('renders male and female side by side without an other option and toggles selection', async () => {
    await act(async () => {
      root.render(
        <StaffFormFieldsHarness initialFormState={createFormState()} mode="add" />,
      )
    })

    const maleButton = getButton(container, 'Male')
    const femaleButton = getButton(container, 'Female')
    const genderButtonsRow = maleButton.parentElement

    if (!(genderButtonsRow instanceof HTMLDivElement)) {
      throw new Error('Gender buttons row not found.')
    }

    expect(genderButtonsRow.className).toContain('grid-cols-2')
    expect(container.textContent).not.toContain('Other')
    expect(getGenderState(container)).toBe('empty')

    await act(async () => {
      maleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getGenderState(container)).toBe('male')

    await act(async () => {
      maleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getGenderState(container)).toBe('empty')

    await act(async () => {
      femaleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getGenderState(container)).toBe('female')
  })

  it('shows no selected button for a legacy other gender while preserving the raw value', async () => {
    await act(async () => {
      root.render(
        <StaffFormFieldsHarness
          initialFormState={createFormState({
            gender: 'other',
            password: '••••••••',
          })}
          mode="edit"
        />,
      )
    })

    const maleButton = getButton(container, 'Male')
    const femaleButton = getButton(container, 'Female')

    expect(getGenderState(container)).toBe('other')
    expect(maleButton.className).not.toContain('bg-primary')
    expect(femaleButton.className).not.toContain('bg-primary')
    expect(container.textContent).not.toContain('Other')
  })
})
