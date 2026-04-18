'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { z } from 'zod'
import { Calendar as CalendarIcon, Pencil } from 'lucide-react'
import { Pattern } from '@/components/ui/file-upload'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { MemberDurationSelect } from '@/components/member-duration-select'
import { FieldInfoTooltip } from '@/components/ui/field-info-tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StringDatePicker } from '@/components/ui/string-date-picker'
import { Textarea } from '@/components/ui/textarea'
import {
  buildBeginTimeValue,
  buildEndTimeValue,
  calculateInclusiveEndDate,
  findMatchingMemberDuration,
  formatAccessDate,
  formatDateInputValue,
  getAccessDateTimeValue,
  getAccessDateInputValue,
  getAccessTimeInputValue,
  getMemberDurationLabel,
  normalizeTimeInputValue,
  parseDateInputValue,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import { compressImage } from '@/lib/compress-image'
import { useMemberTypes } from '@/hooks/use-member-types'
import {
  createMemberEditRequest,
  type CreateMemberEditRequestInput,
} from '@/lib/member-edit-requests'
import { updateMember, uploadMemberPhoto, type UpdateMemberData } from '@/lib/member-actions'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { buildMemberDisplayName, getCleanMemberName } from '@/lib/member-name'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/hooks/use-toast'
import type { Member, MemberGender } from '@/types'

type EditMemberModalProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  requiresApproval?: boolean
}

type EditMemberFormState = {
  name: string
  gender: MemberGender | ''
  email: string
  phone: string
  memberTypeId: string
  joinedDate: string
  remark: string
  startDate: string
  startTime: string
  duration: MemberDurationValue | ''
}

const memberGenders: MemberGender[] = ['Male', 'Female']
const emailSchema = z.string().trim().email('Enter a valid email address.')
const EMPTY_MEMBER_TYPE_VALUE = '__none__'

function normalizeEditMemberFormState(formState: EditMemberFormState) {
  return {
    name: formState.name.trim(),
    gender: formState.gender,
    email: formState.email.trim(),
    phone: formState.phone.trim(),
    memberTypeId: formState.memberTypeId,
    joinedDate: formState.joinedDate.trim(),
    remark: formState.remark.trim(),
    startDate: formState.startDate,
    startTime: formState.startTime,
    duration: formState.duration,
  }
}

function normalizeEditMemberRequestState(formState: EditMemberFormState) {
  const normalizedStartTime = normalizeTimeInputValue(formState.startTime) ?? formState.startTime.trim()

  return {
    name: formState.name.trim(),
    gender: formState.gender,
    email: formState.email.trim(),
    phone: formState.phone.trim(),
    memberTypeId: formState.memberTypeId,
    joinedDate: formState.joinedDate.trim(),
    startDate: formState.startDate.trim(),
    startTime: normalizedStartTime,
    duration: formState.duration,
    durationLabel: getMemberDurationLabel(formState.duration),
  }
}

export function hasEditMemberChanges(
  initialFormState: EditMemberFormState,
  formData: EditMemberFormState,
  hasNewPhoto = false,
) {
  if (hasNewPhoto) {
    return true
  }

  const currentState = normalizeEditMemberFormState(formData)
  const initialState = normalizeEditMemberFormState(initialFormState)

  return JSON.stringify(currentState) !== JSON.stringify(initialState)
}

export function hasEditMemberRequestChanges(
  initialFormState: EditMemberFormState,
  formData: EditMemberFormState,
) {
  const currentState = normalizeEditMemberRequestState(formData)
  const initialState = normalizeEditMemberRequestState(initialFormState)

  return JSON.stringify(currentState) !== JSON.stringify(initialState)
}

export function buildEditMemberRequestPayload(
  initialFormState: EditMemberFormState,
  formData: EditMemberFormState,
): {
  error: string | null
  payload: Omit<CreateMemberEditRequestInput, 'member_id'> | null
} {
  const currentState = normalizeEditMemberRequestState(formData)
  const initialState = normalizeEditMemberRequestState(initialFormState)
  const payload: Omit<CreateMemberEditRequestInput, 'member_id'> = {}
  const hasAccessWindowChanges =
    currentState.startDate !== initialState.startDate ||
    currentState.startTime !== initialState.startTime ||
    currentState.durationLabel !== initialState.durationLabel

  if (hasAccessWindowChanges) {
    if (!currentState.startDate) {
      return {
        error: 'Start date required for access window requests.',
        payload: null,
      }
    }

    if (!currentState.startTime) {
      return {
        error: 'Start time required for access window requests.',
        payload: null,
      }
    }

    if (!currentState.duration || !currentState.durationLabel) {
      return {
        error: 'Duration required for access window requests.',
        payload: null,
      }
    }

    const nextEndDate = calculateInclusiveEndDate(currentState.startDate, currentState.duration)
    const nextBeginTime = buildBeginTimeValue(currentState.startDate, currentState.startTime)
    const nextEndTime = nextEndDate ? buildEndTimeValue(nextEndDate) : null

    if (!nextBeginTime || !nextEndTime) {
      return {
        error: 'The selected access window could not be converted into a valid end date.',
        payload: null,
      }
    }
  }

  if (currentState.name !== initialState.name) {
    payload.proposed_name = currentState.name
  }

  if (currentState.gender !== initialState.gender) {
    if (!currentState.gender) {
      return {
        error: 'Clearing gender is not supported in approval requests.',
        payload: null,
      }
    }

    payload.proposed_gender = currentState.gender
  }

  if (currentState.email !== initialState.email) {
    if (!currentState.email) {
      return {
        error: 'Clearing email is not supported in approval requests.',
        payload: null,
      }
    }

    payload.proposed_email = currentState.email
  }

  if (currentState.phone !== initialState.phone) {
    if (!currentState.phone) {
      return {
        error: 'Clearing phone is not supported in approval requests.',
        payload: null,
      }
    }

    payload.proposed_phone = currentState.phone
  }

  if (currentState.memberTypeId !== initialState.memberTypeId) {
    if (!currentState.memberTypeId) {
      return {
        error: 'Clearing membership type is not supported in approval requests.',
        payload: null,
      }
    }

    payload.proposed_member_type_id = currentState.memberTypeId
  }

  if (currentState.joinedDate !== initialState.joinedDate) {
    if (!currentState.joinedDate) {
      return {
        error: 'Clearing join date is not supported in approval requests.',
        payload: null,
      }
    }

    payload.proposed_join_date = currentState.joinedDate
  }

  if (currentState.startDate !== initialState.startDate) {
    payload.proposed_start_date = currentState.startDate
  }

  if (currentState.startTime !== initialState.startTime) {
    payload.proposed_start_time = currentState.startTime
  }

  if (currentState.durationLabel !== initialState.durationLabel && currentState.durationLabel) {
    payload.proposed_duration = currentState.durationLabel
  }

  if (Object.keys(payload).length === 0) {
    return {
      error: 'Make at least one supported change before submitting.',
      payload: null,
    }
  }

  return {
    error: null,
    payload,
  }
}

function createInitialFormState(member: Member): EditMemberFormState {
  return {
    name: getCleanMemberName(member.name, member.cardCode),
    gender: member.gender ?? '',
    email: member.email ?? '',
    phone: member.phone ?? '',
    memberTypeId: member.memberTypeId ?? '',
    joinedDate: member.joinedAt ?? '',
    remark: member.remark ?? '',
    startDate: getAccessDateInputValue(member.beginTime) || formatDateInputValue(new Date()),
    startTime: getAccessTimeInputValue(member.beginTime) || '00:00:00',
    duration: findMatchingMemberDuration(member.beginTime, member.endTime) ?? '',
  }
}

export function EditMemberModal({
  member,
  open,
  onOpenChange,
  onSuccess,
  requiresApproval = false,
}: EditMemberModalProps) {
  const queryClient = useQueryClient()
  const { memberTypes, isLoading: isMemberTypesLoading, error: memberTypesError } = useMemberTypes({
    enabled: open,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false)
  const [photoFile, setPhotoFile] = useState<FileWithPreview | null>(null)
  const initialFormState = useMemo(() => createInitialFormState(member), [member])
  const [formData, setFormData] = useState<EditMemberFormState>(initialFormState)

  useEffect(() => {
    setFormData(initialFormState)
    setIsSubmitting(false)
    setIsStartDatePickerOpen(false)
    setPhotoFile(null)
  }, [initialFormState, open])

  const selectedStartDate = useMemo(
    () => parseDateInputValue(formData.startDate),
    [formData.startDate],
  )
  const displayedStartDate = useMemo(
    () => (selectedStartDate ? format(selectedStartDate, 'MMM d, yyyy') : 'Select a date'),
    [selectedStartDate],
  )
  const existingBeginTime = useMemo(
    () => getAccessDateTimeValue(member.beginTime),
    [member.beginTime],
  )
  const existingEndTime = useMemo(
    () => getAccessDateTimeValue(member.endTime),
    [member.endTime],
  )
  const hasFormChanges = useMemo(
    () => hasEditMemberChanges(initialFormState, formData),
    [formData, initialFormState],
  )
  const hasRequestChanges = useMemo(
    () => hasEditMemberRequestChanges(initialFormState, formData),
    [formData, initialFormState],
  )
  const isRequestMode = requiresApproval
  const hasChanges = isRequestMode ? hasRequestChanges : hasFormChanges || photoFile !== null
  const hasAccessWindowChanged = useMemo(() => {
    const currentState = normalizeEditMemberFormState(formData)
    const initialState = normalizeEditMemberFormState(initialFormState)

    return (
      currentState.startDate !== initialState.startDate ||
      currentState.startTime !== initialState.startTime ||
      currentState.duration !== initialState.duration
    )
  }, [formData, initialFormState])

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
  const submittedBeginTime = hasAccessWindowChanged ? calculatedBeginTime : existingBeginTime
  const submittedEndTime = hasAccessWindowChanged ? calculatedEndTime : existingEndTime
  const displayedEndTime = hasAccessWindowChanged ? calculatedEndTime : calculatedEndTime ?? member.endTime
  const isEmailValid = useMemo(
    () => !formData.email || emailSchema.safeParse(formData.email).success,
    [formData.email],
  )
  const isFormValid = useMemo(() => {
    if (!formData.name.trim() || !isEmailValid) {
      return false
    }

    if (isRequestMode) {
      if (!hasAccessWindowChanged) {
        return true
      }

      return Boolean(formData.startDate && formData.duration && calculatedBeginTime && calculatedEndTime)
    }

    if (hasAccessWindowChanged) {
      return Boolean(formData.startDate && formData.duration && calculatedBeginTime && calculatedEndTime)
    }

    return Boolean(submittedBeginTime && submittedEndTime)
  }, [
    calculatedBeginTime,
    calculatedEndTime,
    formData.duration,
    formData.name,
    formData.startDate,
    hasAccessWindowChanged,
    isEmailValid,
    isRequestMode,
    submittedBeginTime,
    submittedEndTime,
  ])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsSubmitting(false)
      setIsStartDatePickerOpen(false)
      setPhotoFile(null)
      setFormData(initialFormState)
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    let nextBeginTime: string
    let nextEndTime: string

    if (!formData.name.trim()) {
      toast({
        title: 'Full name required',
        description: 'Enter the member’s full name before saving.',
        variant: 'destructive',
      })
      return
    }

    if (formData.email && !emailSchema.safeParse(formData.email).success) {
      toast({
        title: 'Invalid email',
        description: 'Enter a valid email address or leave the field blank.',
        variant: 'destructive',
      })
      return
    }

    if (isRequestMode) {
      const { error: requestPayloadError, payload } = buildEditMemberRequestPayload(
        initialFormState,
        formData,
      )

      if (requestPayloadError || !payload) {
        toast({
          title: 'Request unavailable',
          description:
            requestPayloadError ?? 'Make at least one supported change before submitting.',
          variant: 'destructive',
        })
        return
      }

      setIsSubmitting(true)

      try {
        await createMemberEditRequest({
          member_id: member.id,
          ...payload,
        })

        handleOpenChange(false)
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.memberEditRequests.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.memberEditRequests.pending }),
        ])
        onSuccess?.()
        toast({
          title: 'Request submitted',
          description: 'Edit request submitted for admin approval',
        })
      } catch (error) {
        console.error('Failed to submit member edit request:', error)
        toast({
          title: 'Request submission failed',
          description:
            error instanceof Error ? error.message : 'Failed to submit the member edit request.',
          variant: 'destructive',
        })
      } finally {
        setIsSubmitting(false)
      }

      return
    }

    if (hasAccessWindowChanged) {
      if (!formData.startDate || !calculatedBeginTime) {
        toast({
          title: 'Start date required',
          description: 'Choose a valid access start date and time.',
          variant: 'destructive',
        })
        return
      }

      if (!formData.duration) {
        toast({
          title: 'Duration required',
          description: 'Choose how long this member should have access.',
          variant: 'destructive',
        })
        return
      }

      if (!calculatedEndTime) {
        toast({
          title: 'End date unavailable',
          description: 'The selected duration could not be converted into an access end date.',
          variant: 'destructive',
        })
        return
      }

      nextBeginTime = calculatedBeginTime
      nextEndTime = calculatedEndTime
    } else if (!submittedBeginTime || !submittedEndTime) {
      toast({
        title: 'Access window unavailable',
        description: 'This member’s current access window could not be read. Update the start date and duration before saving.',
        variant: 'destructive',
      })
      return
    } else {
      nextBeginTime = submittedBeginTime
      nextEndTime = submittedEndTime
    }

    setIsSubmitting(true)

    try {
      const payload: UpdateMemberData = {
        name: formData.name.trim(),
        memberTypeId: formData.memberTypeId || null,
        gender: formData.gender || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        joinedAt: formData.joinedDate.trim() || null,
        remark: formData.remark.trim() || null,
        beginTime: nextBeginTime,
        endTime: nextEndTime,
      }
      const { member: updatedMember, warning } = await updateMember(member.id, payload)

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
                ? `${photoError.message} The member details were saved without updating the photo.`
                : 'The member details were saved without updating the photo.',
            variant: 'destructive',
          })
        }
      }

      handleOpenChange(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) }),
      ])
      onSuccess?.()

      toast({
        title: 'Member updated',
        description:
          warning ??
          `${buildMemberDisplayName(updatedMember.name, updatedMember.cardCode)} was updated successfully.`,
      })
    } catch (error) {
      console.error('Failed to update member:', error)
      toast({
        title: 'Member update failed',
        description: error instanceof Error ? error.message : 'Failed to update member.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]"
        isLoading={isSubmitting}
      >
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>
            {isRequestMode
              ? 'Submit profile and access window changes for admin approval. Photo and remark changes stay on the direct admin path.'
              : 'Update the member profile and access window below. Card actions stay on the member detail page.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 py-2">
            {/* Row 1: Full Name — full width */}
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <div className="flex overflow-hidden rounded-md border border-input bg-background">
                {member.cardCode ? (
                  <span className="flex items-center border-r border-input bg-muted px-3 text-sm font-medium text-muted-foreground">
                    {member.cardCode}
                  </span>
                ) : null}
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Enter member name"
                  className="border-0 shadow-none focus-visible:ring-0"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The card code prefix is shown here for staff and remains part of the Hik member name.
              </p>
            </div>

            {/* Row 2: Gender + Membership Type + Email + Phone + Join Date */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2 sm:col-span-2">
                <Label>Gender</Label>
                <div className="grid grid-cols-2 gap-4">
                  {memberGenders.map((gender) => (
                    <Button
                      key={gender}
                      type="button"
                      variant={formData.gender === gender ? 'default' : 'outline'}
                      onClick={() =>
                        setFormData((currentFormData) => ({
                          ...currentFormData,
                          gender: currentFormData.gender === gender ? '' : gender,
                        }))
                      }
                      disabled={isSubmitting}
                    >
                      {gender}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="edit-type">Membership Type</Label>
                  <FieldInfoTooltip
                    label="Membership type information"
                    content="Leave blank for legacy members who do not have a membership type assigned yet."
                  />
                </div>
                <Select
                  value={formData.memberTypeId || EMPTY_MEMBER_TYPE_VALUE}
                  onValueChange={(value) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      memberTypeId: value === EMPTY_MEMBER_TYPE_VALUE ? '' : value,
                    }))
                  }
                  disabled={isSubmitting || isMemberTypesLoading}
                >
                  <SelectTrigger id="edit-type">
                    <SelectValue
                      placeholder={isMemberTypesLoading ? 'Loading membership types...' : 'Select type'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MEMBER_TYPE_VALUE}>Not set</SelectItem>
                    {memberTypes.map((memberType) => (
                      <SelectItem key={memberType.id} value={memberType.id}>
                        {memberType.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {memberTypesError ? (
                  <p className="text-xs text-destructive">
                    {memberTypesError instanceof Error
                      ? memberTypesError.message
                      : 'Failed to load membership types.'}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      email: event.target.value,
                    }))
                  }
                  placeholder="Optional email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(event) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="Optional phone number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-join-date">Join Date</Label>
                <StringDatePicker
                  id="edit-join-date"
                  value={formData.joinedDate}
                  onChange={(value) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      joinedDate: value,
                    }))
                  }
                  placeholder="Optional join date"
                  allowClear
                />
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Row 4: Start Date + Start Time + Duration — 3 cols */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="edit-start-date">Start Date</Label>
                <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="edit-start-date"
                      type="button"
                      variant="outline"
                      className="w-full justify-between px-3 text-left font-normal"
                      disabled={isSubmitting}
                    >
                      <span>{displayedStartDate}</span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedStartDate ?? undefined}
                      defaultMonth={selectedStartDate ?? undefined}
                      onSelect={(date) => {
                        if (!date) {
                          return
                        }

                        setFormData((currentFormData) => ({
                          ...currentFormData,
                          startDate: formatDateInputValue(date),
                        }))
                        setIsStartDatePickerOpen(false)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-start-time">Start Time</Label>
                <Input
                  id="edit-start-time"
                  type="time"
                  step={1}
                  value={formData.startTime}
                  onChange={(event) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      startTime: event.target.value,
                    }))
                  }
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-duration">Duration</Label>
                <MemberDurationSelect
                  id="edit-duration"
                  value={formData.duration}
                  onValueChange={(value) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      duration: value,
                    }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Row 5: End Date summary — full width */}
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  End Date
                </p>
                <p className="mt-0.5 text-base font-semibold">
                  {displayedEndTime
                    ? formatAccessDate(displayedEndTime, 'long')
                    : 'Select a duration above'}
                </p>
              </div>
              <p className="max-w-[200px] text-right text-xs text-muted-foreground">
                Access always expires at 23:59:59 on the calculated end date.
              </p>
            </div>

            {!isRequestMode ? (
              <>
                <div className="h-px bg-border" />

                {/* Row 6: Avatar — centered */}
                <div className="flex justify-center py-2">
                  <Pattern onFileChange={setPhotoFile} defaultAvatar={member.photoUrl ?? undefined} />
                </div>

                <div className="h-px bg-border" />

                {/* Row 7: Remark — full width */}
                <div className="grid gap-2">
                  <Label htmlFor="edit-remark">Remark</Label>
                  <Textarea
                    id="edit-remark"
                    rows={3}
                    value={formData.remark}
                    onChange={(event) =>
                      setFormData((currentFormData) => ({
                        ...currentFormData,
                        remark: event.target.value,
                      }))
                    }
                    placeholder="Add notes about this member..."
                    className="resize-none"
                  />
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !hasChanges || !isFormValid}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              loading={isSubmitting}
            >
              {isSubmitting ? (isRequestMode ? 'Submitting Request...' : 'Saving...') : (
                <>
                  <Pencil data-icon="inline-start" className="h-4 w-4" />
                  {isRequestMode ? 'Submit Request' : 'Save Changes'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
