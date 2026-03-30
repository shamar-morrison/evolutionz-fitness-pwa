'use client'

import { useEffect, useMemo, useState } from 'react'
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
import {
  addMember,
  MemberProvisioningError,
  type AddMemberData,
} from '@/lib/member-actions'
import {
  fetchAvailableAccessSlots,
  formatAvailableAccessSlotLabel,
} from '@/lib/available-slots'
import { toast } from '@/hooks/use-toast'
import type { AvailableAccessSlot, Member, MemberType } from '@/types'

type AddMemberModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (member: Member) => void
}

type AddMemberFormState = {
  name: string
  selectedSlotEmployeeNo: string
  type: MemberType
  expiry: string
}

const memberTypes: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']

const initialFormState: AddMemberFormState = {
  name: '',
  selectedSlotEmployeeNo: '',
  type: 'General',
  expiry: '',
}

export function AddMemberModal({ open, onOpenChange, onSuccess }: AddMemberModalProps) {
  const [submissionStep, setSubmissionStep] = useState<'idle' | 'assigning_slot'>('idle')
  const [availableSlots, setAvailableSlots] = useState<AvailableAccessSlot[]>([])
  const [isSlotsLoading, setIsSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [formData, setFormData] = useState<AddMemberFormState>(initialFormState)

  const isSubmitting = submissionStep !== 'idle'
  const hasNoAvailableSlots = !isSlotsLoading && availableSlots.length === 0 && !slotsError
  const selectedSlot = useMemo(
    () =>
      availableSlots.find((slot) => slot.employeeNo === formData.selectedSlotEmployeeNo) ?? null,
    [availableSlots, formData.selectedSlotEmployeeNo],
  )

  const loadAvailableSlots = async () => {
    setIsSlotsLoading(true)
    setSlotsError(null)

    try {
      const slots = await fetchAvailableAccessSlots()

      setAvailableSlots(slots)
      setFormData((currentFormData) => ({
        ...currentFormData,
        selectedSlotEmployeeNo: slots.some((slot) => slot.employeeNo === currentFormData.selectedSlotEmployeeNo)
          ? currentFormData.selectedSlotEmployeeNo
          : slots[0]?.employeeNo ?? '',
      }))
    } catch (error) {
      setAvailableSlots([])
      setSlotsError(error instanceof Error ? error.message : 'Failed to load available slots.')
      setFormData((currentFormData) => ({
        ...currentFormData,
        selectedSlotEmployeeNo: '',
      }))
    } finally {
      setIsSlotsLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    void loadAvailableSlots()
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedSlot) {
      toast({
        title: 'Select a slot',
        description: 'Choose an available Hik slot before creating the member.',
        variant: 'destructive',
      })
      return
    }

    setSubmissionStep('assigning_slot')

    try {
      const member = await addMember(
        {
          name: formData.name,
          type: formData.type,
          expiry: formData.expiry,
          slot: selectedSlot,
        },
        {
          onStepChange: setSubmissionStep,
        },
      )

      onOpenChange(false)
      setFormData(initialFormState)
      onSuccess?.(member)
      toast({
        title: 'Member added',
        description: `${member.name} was assigned to Hik slot ${selectedSlot.placeholderName}.`,
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

  const submitLabel =
    submissionStep === 'assigning_slot'
      ? 'Assigning Slot...'
      : 'Save Member'

  const progressDescription =
    submissionStep === 'assigning_slot'
      ? 'Assigning the selected Hik slot to this member.'
      : isSlotsLoading
        ? 'Loading available Hik slots.'
        : slotsError
          ? 'Could not load available Hik slots. Refresh and try again.'
          : hasNoAvailableSlots
            ? 'No reusable Hik slots are available right now. Reset a slot in the device, then refresh.'
            : "Enter the member details below and choose an available Hik slot."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>{progressDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter full name"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="slot">Available Hik Slot</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadAvailableSlots()}
                  disabled={isSubmitting || isSlotsLoading}
                >
                  Refresh
                </Button>
              </div>
              <Select
                value={formData.selectedSlotEmployeeNo}
                onValueChange={(value) => setFormData({ ...formData, selectedSlotEmployeeNo: value })}
                disabled={isSubmitting || isSlotsLoading || availableSlots.length === 0}
              >
                <SelectTrigger id="slot">
                  <SelectValue
                    placeholder={
                      isSlotsLoading
                        ? 'Loading slots...'
                        : hasNoAvailableSlots
                          ? 'No slots available'
                          : 'Select a Hik slot'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.map((slot) => (
                    <SelectItem key={slot.employeeNo} value={slot.employeeNo}>
                      {formatAvailableAccessSlotLabel(slot)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSlotsLoading ? (
                <p className="text-xs text-muted-foreground">Fetching reusable slot records from Hik.</p>
              ) : slotsError ? (
                <p className="text-xs text-destructive">{slotsError}</p>
              ) : hasNoAvailableSlots ? (
                <p className="text-xs text-muted-foreground">
                  No reusable placeholder slots are currently available on the device.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {availableSlots.length} reusable slot{availableSlots.length === 1 ? '' : 's'} loaded from Hik.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Membership Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: MemberType) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="type">
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
              <Label htmlFor="expiry">Expiry Date</Label>
              <Input
                id="expiry"
                type="date"
                value={formData.expiry}
                onChange={(e) => setFormData({ ...formData, expiry: e.target.value })}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isSlotsLoading || availableSlots.length === 0 || !selectedSlot}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
