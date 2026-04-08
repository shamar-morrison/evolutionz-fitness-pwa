// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    loading: _loading,
    ...props
  }: React.ComponentProps<'button'> & { loading?: boolean }) => <button {...props}>{children}</button>,
}))

vi.mock('@/components/ui/dialog', () => ({
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

import { DialogStepForm, type DialogStep } from '@/components/dialog-step-form'

function createSteps(): DialogStep[] {
  return [
    {
      title: 'Step One',
      description: 'First step',
      content: <input id="step-one-input" defaultValue="Alpha" />,
    },
    {
      title: 'Step Two',
      description: 'Second step',
      content: <input id="step-two-input" defaultValue="Beta" />,
    },
    {
      title: 'Step Three',
      description: 'Final step',
      content: <input id="step-three-input" defaultValue="Gamma" />,
    },
  ]
}

describe('DialogStepForm', () => {
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
    vi.clearAllMocks()
  })

  it('ignores form submits before the final step and still submits on the final step', async () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
    })

    await act(async () => {
      root.render(
        <DialogStepForm
          steps={createSteps()}
          currentStep={1}
          isSubmitting={false}
          onCancel={vi.fn()}
          onBack={vi.fn()}
          onNext={vi.fn()}
          onSubmit={onSubmit}
          submitLabel="Save"
        />,
      )
    })

    const nextButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Next',
    )

    if (!(nextButton instanceof HTMLButtonElement)) {
      throw new Error('Next button not found.')
    }

    expect(nextButton.type).toBe('button')

    const form = container.querySelector('form')

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Dialog step form not found.')
    }

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onSubmit).not.toHaveBeenCalled()

    await act(async () => {
      root.render(
        <DialogStepForm
          steps={createSteps()}
          currentStep={3}
          isSubmitting={false}
          onCancel={vi.fn()}
          onBack={vi.fn()}
          onNext={vi.fn()}
          onSubmit={onSubmit}
          submitLabel="Save"
        />,
      )
    })

    const submitButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Save',
    )

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Submit button not found.')
    }

    expect(submitButton.type).toBe('submit')

    const finalStepForm = container.querySelector('form')

    if (!(finalStepForm instanceof HTMLFormElement)) {
      throw new Error('Dialog step form not found after moving to the final step.')
    }

    await act(async () => {
      finalStepForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
