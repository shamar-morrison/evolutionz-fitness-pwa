'use client'

import { useState, useEffect } from 'react'
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
import { updateMember, type UpdateMemberData } from '@/lib/member-actions'
import { getCleanMemberName } from '@/lib/member-name'
import type { Member, MemberType } from '@/types'

type EditMemberModalProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const memberTypes: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']
const END_OF_DAY_SUFFIX = 'T23:59:59'

function getDateInputValue(value: string | null | undefined) {
  return typeof value === 'string' ? value.slice(0, 10) : ''
}

export function EditMemberModal({ member, open, onOpenChange, onSuccess }: EditMemberModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<UpdateMemberData>({
    name: getCleanMemberName(member.name, member.cardCode),
    cardNo: member.cardNo ?? '',
    type: member.type,
    endTime: member.endTime ?? '',
  })

  useEffect(() => {
    setFormData({
      name: getCleanMemberName(member.name, member.cardCode),
      cardNo: member.cardNo ?? '',
      type: member.type,
      endTime: member.endTime ?? '',
    })
  }, [member])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      await updateMember(member.id, formData)
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Failed to update member:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>
            Update the member details below. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter full name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-cardNo">Card Number</Label>
              <Input
                id="edit-cardNo"
                value={formData.cardNo}
                onChange={(e) => setFormData({ ...formData, cardNo: e.target.value })}
                placeholder="EF-XXXXXX"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-type">Membership Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: MemberType) => setFormData({ ...formData, type: value })}
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
              <Label htmlFor="edit-end-time">End Date</Label>
              <Input
                id="edit-end-time"
                type="date"
                value={getDateInputValue(formData.endTime)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    endTime: e.target.value ? `${e.target.value}${END_OF_DAY_SUFFIX}` : '',
                  })
                }
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
