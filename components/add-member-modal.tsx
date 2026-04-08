'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import {
  createInitialMemberFormState,
  getDefaultMemberCardNo,
  MemberAccessFields,
  MemberBasicFields,
  MemberExtrasFields,
} from '@/components/member-form-fields'
import { DialogStepForm, type DialogStep } from '@/components/dialog-step-form'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAvailableCards } from '@/hooks/use-available-cards'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { toast } from '@/hooks/use-toast'
import { compressImage } from '@/lib/compress-image'
import {
  buildBeginTimeValue,
  buildEndTimeValue,
  calculateInclusiveEndDate,
  formatDateInputValue,
} from '@/lib/member-access-time'
import {
  addMember,
  MemberProvisioningError,
  uploadMemberPhoto,
} from '@/lib/member-actions'
import { buildMemberDisplayName, hasUsableCardCode } from '@/lib/member-name'
import { queryKeys } from '@/lib/query-keys'
import type { Member } from '@/types'

type AddMemberModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (member: Member) => void
}

const emailSchema = z.string().trim().email('Enter a valid email address.')

export function AddMemberModal({ open, onOpenChange, onSuccess }: AddMemberModalProps) {
  const queryClient = useQueryClient()
  const [submissionStep, setSubmissionStep] = useState<'idle' | 'provisioning_member'>('idle')
  const [formData, setFormData] = useState(() => createInitialMemberFormState())
  const [photoFile, setPhotoFile] = useState<FileWithPreview | null>(null)
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const {
    cards: availableCards,
    isLoading: isCardsLoading,
    error: cardsError,
    refetch: refetchAvailableCards,
  } = useAvailableCards({ enabled: open })

  const isSubmitting = submissionStep !== 'idle'
  const hasNoAvailableCards = !isCardsLoading && availableCards.length === 0 && !cardsError
  const minimumStartDate = useMemo(() => formatDateInputValue(new Date()), [open])
  const selectedInventoryCard = useMemo(
    () =>
      availableCards.find((card) => card.cardNo === formData.selectedInventoryCardNo) ?? null,
    [availableCards, formData.selectedInventoryCardNo],
  )
  const calculatedEndDate = useMemo(
    () =>
      formData.duration
        ? calculateInclusiveEndDate(formData.startDate, formData.duration)
        : null,
    [formData.duration, formData.startDate],
  )
  const calculatedBeginTime = useMemo(
    () => buildBeginTimeValue(formData.startDate, formData.startTime),
    [formData.startDate, formData.startTime],
  )
  const calculatedEndTime = useMemo(
    () => (calculatedEndDate ? buildEndTimeValue(calculatedEndDate) : null),
    [calculatedEndDate],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setFormData((currentFormData) => {
      const nextSelectedInventoryCardNo = availableCards.some(
        (card) => card.cardNo === currentFormData.selectedInventoryCardNo,
      )
        ? currentFormData.selectedInventoryCardNo
        : getDefaultMemberCardNo(availableCards)

      if (nextSelectedInventoryCardNo === currentFormData.selectedInventoryCardNo) {
        return currentFormData
      }

      return {
        ...currentFormData,
        selectedInventoryCardNo: nextSelectedInventoryCardNo,
      }
    })
  }, [availableCards, open])

  const resetModalState = () => {
    setSubmissionStep('idle')
    setIsStartDatePickerOpen(false)
    setPhotoFile(null)
    setFormData(createInitialMemberFormState())
    setStep(1)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetModalState()
    }

    onOpenChange(nextOpen)
  }

  const validateBasicStep = () => {
    if (!selectedInventoryCard?.cardNo) {
      toast({
        title: 'Select a card',
        description: 'Choose an available access card before creating the member.',
        variant: 'destructive',
      })
      return false
    }

    const selectedCardCode = selectedInventoryCard.cardCode ?? ''

    if (!hasUsableCardCode(selectedCardCode)) {
      toast({
        title: 'Card code required',
        description: 'This card is missing its synced card code. Re-sync the imported cards and try again.',
        variant: 'destructive',
      })
      return false
    }

    if (!formData.name.trim()) {
      toast({
        title: 'Full name required',
        description: 'Enter the member’s full name before saving.',
        variant: 'destructive',
      })
      return false
    }

    if (formData.email && !emailSchema.safeParse(formData.email).success) {
      toast({
        title: 'Invalid email',
        description: 'Enter a valid email address or leave the field blank.',
        variant: 'destructive',
      })
      return false
    }

    return true
  }

  const validateAccessStep = () => {
    if (!formData.startDate || !calculatedBeginTime) {
      toast({
        title: 'Start date required',
        description: 'Choose a valid access start date and time.',
        variant: 'destructive',
      })
      return false
    }

    if (formData.startDate < minimumStartDate) {
      toast({
        title: 'Invalid start date',
        description: 'Choose today or a future date for access to begin.',
        variant: 'destructive',
      })
      return false
    }

    if (!formData.duration) {
      toast({
        title: 'Duration required',
        description: 'Choose how long this member should have access.',
        variant: 'destructive',
      })
      return false
    }

    if (!calculatedEndDate || !calculatedEndTime) {
      toast({
        title: 'End date unavailable',
        description: 'The selected duration could not be converted into an access end date.',
        variant: 'destructive',
      })
      return false
    }

    return true
  }

  const handleNextStep = () => {
    if (step === 1) {
      if (!validateBasicStep()) {
        return
      }

      setStep(2)
      return
    }

    if (step === 2) {
      if (!validateAccessStep()) {
        return
      }

      setStep(3)
    }
  }

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateBasicStep() || !validateAccessStep()) {
      return
    }

    if (!selectedInventoryCard?.cardNo || !calculatedBeginTime || !calculatedEndTime) {
      return
    }

    const selectedCardCode = selectedInventoryCard.cardCode ?? ''

    if (!hasUsableCardCode(selectedCardCode)) {
      return
    }

    setSubmissionStep('provisioning_member')

    try {
      const member = await addMember(
        {
          name: formData.name.trim(),
          type: formData.type,
          ...(formData.gender ? { gender: formData.gender } : {}),
          ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
          ...(formData.phone.trim() ? { phone: formData.phone.trim() } : {}),
          ...(formData.remark.trim() ? { remark: formData.remark.trim() } : {}),
          beginTime: calculatedBeginTime,
          endTime: calculatedEndTime,
          cardNo: selectedInventoryCard.cardNo,
          cardCode: selectedCardCode,
        },
        {
          onStepChange: setSubmissionStep,
        },
      )

      if (photoFile) {
        try {
          const compressedPhoto = await compressImage(photoFile.file)
          await uploadMemberPhoto(member.id, compressedPhoto)
          void queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) })
        } catch (photoError) {
          console.error('Failed to upload member photo:', photoError)
          toast({
            title: 'Photo upload failed',
            description:
              photoError instanceof Error
                ? `${photoError.message} The member was saved without a photo.`
                : 'The member was saved without a photo.',
            variant: 'destructive',
          })
        }
      }

      handleOpenChange(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentMembers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
      ])
      onSuccess?.(member)
      toast({
        title: 'Member added',
        description: `${buildMemberDisplayName(member.name, member.cardCode)} was provisioned with card ${member.cardNo}.`,
      })
    } catch (error) {
      if (error instanceof MemberProvisioningError) {
        toast({
          title: 'Member creation failed',
          description: error.message,
          variant: 'destructive',
        })
      } else {
        console.error('Failed to add member:', error)
        toast({
          title: 'Member creation failed',
          description: error instanceof Error ? error.message : 'Failed to add member.',
          variant: 'destructive',
        })
      }
    } finally {
      setSubmissionStep('idle')
    }
  }

  const steps: DialogStep[] = [
    {
      title: 'Add New Member',
      description: isCardsLoading
        ? 'Loading imported unassigned cards.'
        : cardsError
          ? 'Could not load imported cards. Refresh the inventory and try again.'
          : hasNoAvailableCards
            ? 'No imported unassigned cards are available. Import more cards into iVMS-4200 and re-sync.'
            : 'Choose an imported unassigned card and enter the member’s basic profile.',
      content: (
        <MemberBasicFields
          idPrefix="member"
          formData={formData}
          setFormData={setFormData}
          isSubmitting={isSubmitting}
          availableCards={availableCards}
          selectedInventoryCard={selectedInventoryCard}
          isCardsLoading={isCardsLoading}
          cardsError={cardsError}
          hasNoAvailableCards={hasNoAvailableCards}
          onRefreshCards={() => {
            void refetchAvailableCards()
          }}
        />
      ),
    },
    {
      title: 'Add New Member',
      description: 'Set when access should begin and how long this member should have access.',
      content: (
        <MemberAccessFields
          idPrefix="member"
          formData={formData}
          setFormData={setFormData}
          isSubmitting={isSubmitting}
          minimumStartDate={minimumStartDate}
          calculatedEndTime={calculatedEndTime}
          isStartDatePickerOpen={isStartDatePickerOpen}
          setIsStartDatePickerOpen={setIsStartDatePickerOpen}
        />
      ),
    },
    {
      title: 'Add New Member',
      description:
        submissionStep === 'provisioning_member'
          ? 'Creating the Hik member record and assigning the selected card.'
          : 'Add an optional photo and notes, then save the member.',
      content: (
        <MemberExtrasFields
          idPrefix="member"
          formData={formData}
          setFormData={setFormData}
          setPhotoFile={setPhotoFile}
        />
      ),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]"
        isLoading={isSubmitting}
      >
        <DialogStepForm
          steps={steps}
          currentStep={step}
          isSubmitting={isSubmitting}
          onCancel={() => handleOpenChange(false)}
          onBack={() => setStep((currentStep) => (currentStep === 3 ? 2 : 1))}
          onNext={handleNextStep}
          onSubmit={handleSubmit}
          submitLabel="Save Member"
          submitLoadingLabel="Provisioning Access..."
          submitDisabled={
            isSubmitting ||
            !selectedInventoryCard ||
            !selectedInventoryCard.cardCode ||
            isCardsLoading ||
            !formData.duration ||
            !calculatedBeginTime ||
            !calculatedEndTime
          }
        />
      </DialogContent>
    </Dialog>
  )
}
