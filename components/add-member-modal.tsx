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
import { AddAccessCardModal } from '@/components/add-access-card-modal'
import { DialogStepForm, type DialogStep } from '@/components/dialog-step-form'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAvailableCards } from '@/hooks/use-available-cards'
import { useMemberTypes } from '@/hooks/use-member-types'
import { usePermissions } from '@/hooks/use-permissions'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { toast } from '@/hooks/use-toast'
import { compressImage } from '@/lib/compress-image'
import { addMember, uploadMemberPhoto } from '@/lib/member-actions'
import {
  createMemberApprovalRequest,
  uploadMemberApprovalRequestPhoto,
} from '@/lib/member-approval-requests'
import {
  buildBeginTimeValue,
  buildEndTimeValue,
  calculateInclusiveEndDate,
  formatDateInputValue,
} from '@/lib/member-access-time'
import { buildMemberDisplayName, hasUsableCardCode } from '@/lib/member-name'
import { queryKeys } from '@/lib/query-keys'
import type { MemberType } from '@/types'

type AddMemberModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const emailSchema = z.string().trim().email('Enter a valid email address.')
type SubmissionStep = 'idle' | 'submitting_request' | 'creating_member'
type MemberSubmissionContext = {
  beginTime: string
  endTime: string
  cardNo: string
  cardCode: string
}

function isProvisionableMemberType(value: string): value is MemberType {
  return value === 'General' || value === 'Civil Servant' || value === 'Student/BPO'
}

function revokePreviewUrl(previewUrl: string | null | undefined) {
  if (previewUrl && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(previewUrl)
  }
}

export function AddMemberModal({ open, onOpenChange, onSuccess }: AddMemberModalProps) {
  const queryClient = useQueryClient()
  const { role, requiresApproval } = usePermissions()
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep>('idle')
  const [formData, setFormData] = useState(() => createInitialMemberFormState())
  const [manuallyAddedCard, setManuallyAddedCard] = useState<{
    cardNo: string
    cardCode: string | null
  } | null>(null)
  const [photoFile, setPhotoFile] = useState<FileWithPreview | null>(null)
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false)
  const [isAddAccessCardModalOpen, setIsAddAccessCardModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const {
    cards: availableCards,
    isLoading: isCardsLoading,
    error: cardsError,
    refetch: refetchAvailableCards,
  } = useAvailableCards({ enabled: open })
  const {
    memberTypes,
    isLoading: isMemberTypesLoading,
    error: memberTypesError,
  } = useMemberTypes({ enabled: open })

  const isSubmitting = submissionStep !== 'idle'
  const hasNoAvailableCards = !isCardsLoading && availableCards.length === 0 && !cardsError
  const minimumStartDate = useMemo(() => formatDateInputValue(new Date()), [open])
  const selectedInventoryCard = useMemo(
    () =>
      availableCards.find((card) => card.cardNo === formData.selectedInventoryCardNo) ??
      (manuallyAddedCard?.cardNo === formData.selectedInventoryCardNo ? manuallyAddedCard : null),
    [availableCards, formData.selectedInventoryCardNo, manuallyAddedCard],
  )
  const hasSelectedCardCode = hasUsableCardCode(selectedInventoryCard?.cardCode)
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
  const selectedMemberType = useMemo(
    () => memberTypes.find((memberType) => memberType.id === formData.memberTypeId) ?? null,
    [formData.memberTypeId, memberTypes],
  )
  const needsMemberApproval = role !== 'admin' && requiresApproval('members.create')
  const membershipTypeInfoContent = needsMemberApproval
    ? 'Select the membership type that will be used if the request is approved.'
    : 'Select the membership type to assign when the member is created immediately.'
  const submitLabel = needsMemberApproval ? 'Submit Request' : 'Create Member'
  const submitLoadingLabel = needsMemberApproval ? 'Submitting Request...' : 'Creating Member...'

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

  useEffect(() => {
    const previewUrl = photoFile?.preview

    return () => {
      revokePreviewUrl(previewUrl)
    }
  }, [photoFile])

  const resetModalState = () => {
    setSubmissionStep('idle')
    setManuallyAddedCard(null)
    setIsStartDatePickerOpen(false)
    setIsAddAccessCardModalOpen(false)
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

    if (!formData.memberTypeId) {
      toast({
        title: 'Membership type required',
        description: 'Select a membership type before saving.',
        variant: 'destructive',
      })
      return false
    }

    if (!formData.gender) {
      toast({
        title: 'Gender required',
        description: 'Select the member’s gender before saving.',
        variant: 'destructive',
      })
      return false
    }

    if (!formData.email.trim()) {
      toast({
        title: 'Email required',
        description: 'Enter the member’s email address before saving.',
        variant: 'destructive',
      })
      return false
    }

    if (!emailSchema.safeParse(formData.email).success) {
      toast({
        title: 'Invalid email',
        description: 'Enter a valid email address before saving.',
        variant: 'destructive',
      })
      return false
    }

    if (!formData.phone.trim()) {
      toast({
        title: 'Phone required',
        description: 'Enter the member’s phone number before saving.',
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

  const submitMemberApprovalRequest = async ({
    beginTime,
    endTime,
    cardCode,
    cardNo,
  }: MemberSubmissionContext) => {
    const gender = formData.gender
    const email = formData.email.trim()
    const phone = formData.phone.trim()

    if (!gender || !email || !phone) {
      toast({
        title: 'Member profile incomplete',
        description: 'Complete the required profile fields before saving.',
        variant: 'destructive',
      })
      return
    }

    setSubmissionStep('submitting_request')

    try {
      const createdRequest = await createMemberApprovalRequest({
        name: formData.name.trim(),
        member_type_id: formData.memberTypeId,
        gender,
        email,
        phone,
        ...(formData.remark.trim() ? { remark: formData.remark.trim() } : {}),
        ...(formData.joinedDate ? { joined_at: formData.joinedDate } : {}),
        beginTime,
        endTime,
        cardNo,
        cardCode,
      })

      if (photoFile) {
        try {
          const compressedPhoto = await compressImage(photoFile.file)
          await uploadMemberApprovalRequestPhoto(createdRequest.id, compressedPhoto)
        } catch (photoError) {
          console.error('Failed to upload member request photo:', photoError)
          toast({
            title: 'Photo upload failed',
            description:
              photoError instanceof Error
                ? `${photoError.message} The request was submitted without a photo.`
                : 'The request was submitted without a photo.',
            variant: 'destructive',
          })
        }
      }

      handleOpenChange(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.memberApprovalRequests.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberApprovalRequests.pending }),
      ])
      onSuccess?.()
      toast({
        title: 'Request submitted',
        description: `${createdRequest.name} was submitted for admin approval.`,
      })
    } catch (error) {
      console.error('Failed to submit member request:', error)
      toast({
        title: 'Request submission failed',
        description: error instanceof Error ? error.message : 'Failed to submit the member request.',
        variant: 'destructive',
      })
    } finally {
      setSubmissionStep('idle')
    }
  }

  const createMemberDirectly = async ({
    beginTime,
    endTime,
    cardCode,
    cardNo,
  }: MemberSubmissionContext) => {
    const gender = formData.gender
    const email = formData.email.trim()
    const phone = formData.phone.trim()

    if (!gender || !email || !phone) {
      toast({
        title: 'Member profile incomplete',
        description: 'Complete the required profile fields before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!selectedMemberType) {
      toast({
        title: 'Membership type unavailable',
        description: 'Select a valid membership type before creating the member.',
        variant: 'destructive',
      })
      return
    }

    if (!isProvisionableMemberType(selectedMemberType.name)) {
      toast({
        title: 'Unsupported membership type',
        description: 'The selected membership type cannot be used for direct member creation.',
        variant: 'destructive',
      })
      return
    }

    setSubmissionStep('creating_member')

    try {
      const { member: createdMember, warning } = await addMember({
        name: formData.name.trim(),
        type: selectedMemberType.name,
        memberTypeId: selectedMemberType.id,
        gender,
        email,
        phone,
        ...(formData.remark.trim() ? { remark: formData.remark.trim() } : {}),
        ...(formData.joinedDate ? { joinedAt: formData.joinedDate } : {}),
        beginTime,
        endTime,
        cardNo,
        cardCode,
      })

      if (photoFile) {
        try {
          const compressedPhoto = await compressImage(photoFile.file)
          await uploadMemberPhoto(createdMember.id, compressedPhoto)
        } catch (photoError) {
          console.error('Failed to upload member photo:', photoError)
          toast({
            title: 'Photo upload failed',
            description:
              photoError instanceof Error
                ? `${photoError.message} The member was created without a photo.`
                : 'The member was created without a photo.',
            variant: 'destructive',
          })
        }
      }

      handleOpenChange(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentMembers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
      ])
      onSuccess?.()
      toast({
        title: 'Member created',
        description:
          warning ??
          `${buildMemberDisplayName(createdMember.name, createdMember.cardCode)} was created successfully.`,
      })
    } catch (error) {
      console.error('Failed to create member:', error)
      toast({
        title: 'Member creation failed',
        description: error instanceof Error ? error.message : 'Failed to create the member.',
        variant: 'destructive',
      })
    } finally {
      setSubmissionStep('idle')
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

    const submissionContext = {
      beginTime: calculatedBeginTime,
      endTime: calculatedEndTime,
      cardNo: selectedInventoryCard.cardNo,
      cardCode: selectedCardCode,
    } satisfies MemberSubmissionContext

    if (needsMemberApproval) {
      await submitMemberApprovalRequest(submissionContext)
      return
    }

    await createMemberDirectly(submissionContext)
  }

  const steps: DialogStep[] = [
    {
      title: 'Add New Member',
      description: isCardsLoading
        ? 'Loading available unassigned cards.'
        : cardsError
          ? 'Could not load available cards. Refresh the inventory and try again.'
          : hasNoAvailableCards
            ? 'No unassigned cards are available. Sync cards from iVMS or add one manually.'
            : 'Choose an available unassigned card and enter the member’s basic profile.',
      content: (
        <MemberBasicFields
          idPrefix="member"
          formData={formData}
          setFormData={setFormData}
          isSubmitting={isSubmitting}
          availableCards={availableCards}
          canAddCard={role === 'admin'}
          selectedInventoryCard={selectedInventoryCard}
          isCardsLoading={isCardsLoading}
          cardsError={cardsError}
          hasNoAvailableCards={hasNoAvailableCards}
          memberTypes={memberTypes}
          memberTypesError={memberTypesError instanceof Error ? memberTypesError.message : null}
          isMemberTypesLoading={isMemberTypesLoading}
          membershipTypeInfoContent={membershipTypeInfoContent}
          onAddCard={() => setIsAddAccessCardModalOpen(true)}
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
        submissionStep === 'submitting_request'
          ? 'Submitting the member request for admin approval.'
          : submissionStep === 'creating_member'
            ? 'Creating the member and assigning the selected access card.'
            : needsMemberApproval
              ? 'Add an optional photo and notes, then submit the request.'
              : 'Add an optional photo and notes, then create the member.',
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
    <>
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
            submitLabel={submitLabel}
            submitLoadingLabel={submitLoadingLabel}
            submitDisabled={
              isSubmitting ||
              !selectedInventoryCard ||
              !hasSelectedCardCode ||
              isCardsLoading ||
              isMemberTypesLoading ||
              !formData.memberTypeId ||
              !formData.duration ||
              !calculatedBeginTime ||
              !calculatedEndTime
            }
          />
        </DialogContent>
      </Dialog>

      <AddAccessCardModal
        open={isAddAccessCardModalOpen}
        onOpenChange={setIsAddAccessCardModalOpen}
        onSuccess={(card) => {
          setManuallyAddedCard(card)
          setFormData((currentFormData) => ({
            ...currentFormData,
            selectedInventoryCardNo: card.cardNo,
          }))
        }}
      />
    </>
  )
}
