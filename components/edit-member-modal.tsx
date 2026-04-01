'use client'

import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  getAccessDateInputValue,
  getAccessTimeInputValue,
  MEMBER_DURATION_OPTIONS,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import { updateMember, type UpdateMemberData } from '@/lib/member-actions'
import { buildMemberDisplayName, getCleanMemberName } from '@/lib/member-name'
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<EditMemberFormState>(() => createInitialFormState(member))

  useEffect(() => {
    setFormData(createInitialFormState(member))
    setIsSubmitting(false)
  }, [member, open])

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
  const displayedEndTime = calculatedEndTime ?? member.endTime

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsSubmitting(false)
      setFormData(createInitialFormState(member))
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formData.name.trim()) {
      toast({
        title: 'Full name required',
        description: 'Enter the member’s full name before saving.',
        variant: 'destructive',
      })
      return
    }

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

    if (formData.email && !emailSchema.safeParse(formData.email).success) {
      toast({
        title: 'Invalid email',
        description: 'Enter a valid email address or leave the field blank.',
        variant: 'destructive',
      })
      return
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
        beginTime: calculatedBeginTime,
        endTime: calculatedEndTime,
      }
      const { member: updatedMember, warning } = await updateMember(member.id, payload)

      handleOpenChange(false)
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>
            Update the member profile and access window below. Card actions stay on the member detail page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 py-2 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid content-start gap-4">
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
                />
              </div>
            </div>

            <div className="grid content-start gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-start-date">Start Date</Label>
                <Input
                  id="edit-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(event) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      startDate: event.target.value,
                    }))
                  }
                  required
                />
                <div className="grid gap-2">
                  <Label htmlFor="edit-start-time" className="text-xs text-muted-foreground">
                    Start Time
                  </Label>
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

              <div className="grid gap-2 rounded-lg border bg-muted/30 p-4">
                <Label>End Date</Label>
                <p className="text-lg font-semibold">
                  {displayedEndTime ? formatAccessDate(displayedEndTime, 'long') : 'Select a duration'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Access always expires at 23:59:59 on the calculated end date.
                </p>
              </div>

              {/* TODO: implement photo upload to Supabase Storage */}
              <button
                type="button"
                className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-muted/20 text-center transition-colors hover:bg-muted/30"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-input bg-background">
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </span>
                <div className="space-y-1">
                  <p className="font-medium">Add Photo</p>
                  <p className="text-sm text-muted-foreground">
                    Photo uploads will be connected in a later update.
                  </p>
                </div>
              </button>
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
              disabled={isSubmitting || !formData.duration || !calculatedBeginTime || !calculatedEndTime}
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
