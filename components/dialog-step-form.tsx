'use client'

import type { MouseEventHandler, ReactNode, SubmitEventHandler } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DialogStep = {
  title: string
  description: string
  content: ReactNode
}

type DialogStepFormProps = {
  steps: readonly DialogStep[]
  currentStep: number
  isSubmitting: boolean
  onCancel: () => void
  onBack: () => void
  onNext: () => void
  onSubmit: SubmitEventHandler<HTMLFormElement>
  submitLabel: string
  submitLoadingLabel?: string
  submitIcon?: ReactNode
  nextDisabled?: boolean
  submitDisabled?: boolean
  cancelLabel?: string
  backLabel?: string
  nextLabel?: string
  className?: string
}

export function DialogStepForm({
  steps,
  currentStep,
  isSubmitting,
  onCancel,
  onBack,
  onNext,
  onSubmit,
  submitLabel,
  submitLoadingLabel,
  submitIcon,
  nextDisabled = false,
  submitDisabled = false,
  cancelLabel = 'Cancel',
  backLabel = 'Back',
  nextLabel = 'Next',
  className = 'space-y-5',
}: DialogStepFormProps) {
  const stepIndex = Math.min(Math.max(currentStep - 1, 0), steps.length - 1)
  const step = steps[stepIndex]
  const isFinalStep = currentStep === steps.length
  const handleNextClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault()
    onNext()
  }

  return (
    <>
      <DialogHeader>
        <p className="text-sm font-medium text-muted-foreground">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <DialogTitle>{step.title}</DialogTitle>
        <DialogDescription>{step.description}</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className={className}>
        {step.content}

        <DialogFooter>
          {currentStep === 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              {cancelLabel}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSubmitting}
            >
              {backLabel}
            </Button>
          )}

          {isFinalStep ? (
            <Button
              key="dialog-step-submit-button"
              type="submit"
              disabled={submitDisabled}
              loading={isSubmitting}
            >
              {isSubmitting && submitLoadingLabel ? submitLoadingLabel : (
                <>
                  {submitIcon}
                  {submitLabel}
                </>
              )}
            </Button>
          ) : (
            <Button
              key="dialog-step-next-button"
              type="button"
              onClick={handleNextClick}
              disabled={isSubmitting || nextDisabled}
            >
              {nextLabel}
            </Button>
          )}
        </DialogFooter>
      </form>
    </>
  )
}
