'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { toast } from '@/hooks/use-toast'
import type { Member, MemberType } from '@/types'

type AddMemberModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (member: Member) => void
}

const memberTypes: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']

export function AddMemberModal({ open, onOpenChange, onSuccess }: AddMemberModalProps) {
  const router = useRouter()
  const [submissionStep, setSubmissionStep] = useState<'idle' | 'creating_member' | 'issuing_card'>('idle')
  const [formData, setFormData] = useState<AddMemberData>({
    name: '',
    cardNo: '',
    type: 'General',
    expiry: '',
  })

  const isSubmitting = submissionStep !== 'idle'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmissionStep('creating_member')

    try {
      const member = await addMember(formData, {
        onStepChange: setSubmissionStep,
      })
      onOpenChange(false)
      setFormData({ name: '', cardNo: '', type: 'General', expiry: '' })
      onSuccess?.(member)
      toast({
        title: 'Member added',
        description: `${member.name} was created on the device and their card was issued.`,
      })
    } catch (error) {
      if (error instanceof MemberProvisioningError) {
        if (error.step === 'issuing_card' && error.member) {
          onOpenChange(false)
          setFormData({ name: '', cardNo: '', type: 'General', expiry: '' })
          toast({
            title: 'Card issuance failed',
            description: `${error.member.name} was created on the device, but card issuance failed. Open the member to retry the card step.`,
            variant: 'destructive',
          })
          router.push(`/members/${error.member.id}`)
        } else {
          toast({
            title: 'Member creation failed',
            description: error.message,
            variant: 'destructive',
          })
        }
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
    submissionStep === 'creating_member'
      ? 'Creating Member...'
      : submissionStep === 'issuing_card'
        ? 'Issuing Card...'
        : 'Save Member'

  const progressDescription =
    submissionStep === 'creating_member'
      ? 'Creating the member on the device.'
      : submissionStep === 'issuing_card'
        ? 'Member created. Issuing the access card now.'
        : "Enter the member details below. Click save when you're done."

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
              <Label htmlFor="cardNo">Card Number</Label>
              <Input
                id="cardNo"
                value={formData.cardNo}
                onChange={(e) => setFormData({ ...formData, cardNo: e.target.value })}
                placeholder="EF-XXXXXX"
                required
              />
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
              disabled={isSubmitting}
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
