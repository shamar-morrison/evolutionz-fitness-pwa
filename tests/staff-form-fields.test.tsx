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
    confirmPassword: 'password123',
    phone: '876-555-0100',
    gender: '',
    remark: '',
    titles: ['Trainer'],
    specialties: [],
    ...overrides,
  }
}

function StaffFormFieldsHarness({
  initialFormState,
  mode,
  resetPasswordVisibilityKey,
}: {
  initialFormState: StaffFormState
  mode: 'add' | 'edit'
  resetPasswordVisibilityKey?: boolean | number | string
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
        resetPasswordVisibilityKey={resetPasswordVisibilityKey}
      />
      <output data-testid="gender-state">{formData.gender || 'empty'}</output>
      <output data-testid="titles-state">{JSON.stringify(formData.titles)}</output>
      <output data-testid="specialties-state">{JSON.stringify(formData.specialties)}</output>
    </>
  )
}

function getTextOutput(container: HTMLDivElement, testId: string) {
  const output = container.querySelector(`[data-testid="${testId}"]`)

  if (!(output instanceof HTMLOutputElement)) {
    throw new Error(`${testId} output not found.`)
  }

  return output.textContent
}

function getArrayOutput(container: HTMLDivElement, testId: string) {
  return JSON.parse(getTextOutput(container, testId) ?? '[]') as string[]
}

function getButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

function getIconButton(container: HTMLDivElement, label: string) {
  const button = container.querySelector(`button[aria-label="${label}"]`)

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
    expect(getTextOutput(container, 'gender-state')).toBe('empty')

    await act(async () => {
      maleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getTextOutput(container, 'gender-state')).toBe('male')

    await act(async () => {
      maleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getTextOutput(container, 'gender-state')).toBe('empty')

    await act(async () => {
      femaleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getTextOutput(container, 'gender-state')).toBe('female')
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

    expect(getTextOutput(container, 'gender-state')).toBe('other')
    expect(maleButton.className).not.toContain('bg-primary')
    expect(femaleButton.className).not.toContain('bg-primary')
    expect(container.textContent).not.toContain('Other')
    expect(container.querySelector('button[aria-label="Show password"]')).toBeNull()
  })

  it('renders add-mode password confirmation and toggles visibility for both fields', async () => {
    await act(async () => {
      root.render(
        <StaffFormFieldsHarness initialFormState={createFormState()} mode="add" />,
      )
    })

    const passwordInput = container.querySelector('#staff-test-password')
    const confirmPasswordInput = container.querySelector('#staff-test-confirm-password')

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error('Password input not found.')
    }

    if (!(confirmPasswordInput instanceof HTMLInputElement)) {
      throw new Error('Confirm password input not found.')
    }

    expect(passwordInput.type).toBe('password')
    expect(confirmPasswordInput.type).toBe('password')

    await act(async () => {
      getIconButton(container, 'Show password').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })

    expect(passwordInput.type).toBe('text')
    expect(confirmPasswordInput.type).toBe('text')
  })

  it('renders titles as toggleable chips and keeps them deduplicated', async () => {
    await act(async () => {
      root.render(
        <StaffFormFieldsHarness
          initialFormState={createFormState({ titles: ['Trainer'] })}
          mode="add"
        />,
      )
    })

    const ownerButton = getButton(container, 'Owner')
    const trainerButton = getButton(container, 'Trainer')

    expect(getArrayOutput(container, 'titles-state')).toEqual(['Trainer'])

    await act(async () => {
      ownerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getArrayOutput(container, 'titles-state')).toEqual(['Owner', 'Trainer'])

    await act(async () => {
      trainerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getArrayOutput(container, 'titles-state')).toEqual(['Owner'])
  })

  it('renders trainer specialties as toggleable chips and updates the selected state', async () => {
    await act(async () => {
      root.render(
        <StaffFormFieldsHarness initialFormState={createFormState()} mode="add" />,
      )
    })

    const strengthButton = getButton(container, 'Strength Training')
    const hiitButton = getButton(container, 'HIIT')

    expect(container.textContent).toContain('Specialties')
    expect(getArrayOutput(container, 'specialties-state')).toEqual([])

    await act(async () => {
      hiitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getArrayOutput(container, 'specialties-state')).toEqual(['HIIT'])

    await act(async () => {
      strengthButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getArrayOutput(container, 'specialties-state')).toEqual(['Strength Training', 'HIIT'])
  })

  it('clears specialties immediately when trainer is deselected', async () => {
    await act(async () => {
      root.render(
        <StaffFormFieldsHarness
          initialFormState={createFormState({
            titles: ['Owner', 'Trainer'],
            specialties: ['Strength Training'],
          })}
          mode="edit"
        />,
      )
    })

    await act(async () => {
      getButton(container, 'Trainer').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).not.toContain('Specialties')
    expect(getArrayOutput(container, 'titles-state')).toEqual(['Owner'])
    expect(getArrayOutput(container, 'specialties-state')).toEqual([])
  })
})
