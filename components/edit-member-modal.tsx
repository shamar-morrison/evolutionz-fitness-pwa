'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { z } from 'zod'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Pattern } from '@/components/ui/file-upload'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
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
  MEMBER_DURATION_OPTIONS,
  parseDateInputValue,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import { compressImage } from '@/lib/compress-image'
import { updateMember, uploadMemberPhoto, type UpdateMemberData } from '@/lib/member-actions'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { buildMemberDisplayName, getCleanMemberName } from '@/lib/member-name'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/hooks/use-toast'
import type { Member, MemberGender, MemberType } from '@/types'

type EditMemberModalProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type EditMemberFormState = {
  name: string
  gender: MemberGender | ''
  email: string
  phone: string
  type: MemberType
  remark: string
  startDate: string
  startTime: string
  duration: MemberDurationValue | ''
}

const memberTypes: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']
const memberGenders: MemberGender[] = ['Male', 'Female']
const emailSchema = z.string().trim().email('Enter a valid email address.')

function normalizeEditMemberFormState(formState: EditMemberFormState) {
  return {
    name: formState.name.trim(),
    gender: formState.gender,
    email: formState.email.trim(),
    phone: formState.phone.trim(),
    type: formState.type,
    remark: formState.remark.trim(),
    startDate: formState.startDate,
    startTime: formState.startTime,
    duration: formState.duration,
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

function createInitialFormState(member: Member): EditMemberFormState {
  return {
    name: getCleanMemberName(member.name, member.cardCode),
    gender: member.gender ?? '',
    email: member.email ?? '',
    phone: member.phone ?? '',
    type: member.type,
    remark: member.remark ?? '',
    startDate: getAccessDateInputValue(member.beginTime) || formatDateInputValue(new Date()),
    startTime: getAccessTimeInputValue(member.beginTime) || '00:00:00',
    duration: findMatchingMemberDuration(member.beginTime, member.endTime) ?? '',
  }
}

export function EditMemberModal({ member, open, onOpenChange, onSuccess }: EditMemberModalProps) {
  const queryClient = useQueryClient()
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
  const hasChanges = hasFormChanges || photoFile !== null
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

  const handleSubmit = async (event: React.FormEvent) => {
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
        type: formData.type,
        gender: formData.gender || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>
            Update the member profile and access window below. Card actions stay on the member detail page.
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

            {/* Row 2: Gender + Membership Type — 2 cols */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Gender</Label>
                <div className="grid grid-cols-2 gap-2">
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
                <Label htmlFor="edit-type">Membership Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: MemberType) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      type: value,
                    }))
                  }
                >
                  <SelectTrigger id="edit-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Email + Phone — 2 cols */}
            <div className="grid gap-4 sm:grid-cols-2">
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
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-duration">Duration</Label>
                <Select
                  value={formData.duration}
                  onValueChange={(value: MemberDurationValue) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      duration: value,
                    }))
                  }
                >
                  <SelectTrigger id="edit-duration">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 5: End Date summary — full width */}
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End Date</p>
                <p className="text-base font-semibold mt-0.5">
                  {displayedEndTime ? formatAccessDate(displayedEndTime, 'long') : 'Select a duration above'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right max-w-[200px]">
                Access always expires at 23:59:59 on the calculated end date.
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* Row 6: Avatar — centered */}
            <div className="flex justify-center py-2">
              <Pattern
                onFileChange={setPhotoFile}
                defaultAvatar={member.photoUrl ?? undefined}
              />
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
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
