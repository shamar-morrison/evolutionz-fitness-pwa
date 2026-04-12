'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  MemberPaymentFields,
  createInitialMemberPaymentFormState,
} from '@/components/member-payment-fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMemberTypes } from '@/hooks/use-member-types'
import { toast } from '@/hooks/use-toast'
import { recordMemberPayment } from '@/lib/member-payments'
import { createMemberPaymentRequest } from '@/lib/member-payment-requests'
import { queryKeys } from '@/lib/query-keys'
import type { Member } from '@/types'

type RecordMemberPaymentDialogProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  requiresApproval?: boolean
}

export function RecordMemberPaymentDialog({
  member,
  open,
  onOpenChange,
  requiresApproval = false,
}: RecordMemberPaymentDialogProps) {
  const queryClient = useQueryClient()
  const { memberTypes, isLoading: isMemberTypesLoading, error: memberTypesError } = useMemberTypes({
    enabled: open,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amountDirty, setAmountDirty] = useState(false)
  const [formData, setFormData] = useState(() =>
    createInitialMemberPaymentFormState(member.memberTypeId ?? '', memberTypes),
  )
  const previousOpenRef = useRef(false)
  const previousMemberIdRef = useRef(member.id)

  useEffect(() => {
    const memberChanged = previousMemberIdRef.current !== member.id
    const shouldResetState = open && (!previousOpenRef.current || memberChanged)

    previousOpenRef.current = open
    previousMemberIdRef.current = member.id

    if (!shouldResetState) {
      return
    }

    setFormData(createInitialMemberPaymentFormState(member.memberTypeId ?? '', memberTypes))
    setAmountDirty(false)
    setIsSubmitting(false)
  }, [member.id, member.memberTypeId, memberTypes, open])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!requiresApproval && !formData.memberTypeId) {
      toast({
        title: 'Membership type required',
        description: 'Select a membership type before recording the payment.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.paymentMethod) {
      toast({
        title: 'Payment method required',
        description: 'Select how the payment was collected before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.paymentDate) {
      toast({
        title: 'Payment date required',
        description: 'Choose the payment date before saving.',
        variant: 'destructive',
      })
      return
    }

    const parsedAmount = Number(formData.amount)
    const hasValidAmount = requiresApproval
      ? Number.isFinite(parsedAmount) && parsedAmount > 0
      : Number.isFinite(parsedAmount) && parsedAmount >= 0

    if (!hasValidAmount) {
      toast({
        title: 'Amount required',
        description: requiresApproval
          ? 'Enter a valid amount greater than 0.'
          : 'Enter a valid amount that is 0 or greater.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (requiresApproval) {
        await createMemberPaymentRequest({
          member_id: member.id,
          amount: parsedAmount,
          payment_method: formData.paymentMethod,
          payment_date: formData.paymentDate,
          ...(formData.memberTypeId ? { member_type_id: formData.memberTypeId } : {}),
          ...(formData.notes.trim() ? { notes: formData.notes.trim() } : {}),
        })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.memberPaymentRequests.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.memberPaymentRequests.pending }),
        ])
        toast({
          title: 'Request submitted',
          description: 'Payment request submitted for admin approval',
        })
      } else {
        await recordMemberPayment(member.id, {
          member_type_id: formData.memberTypeId,
          payment_method: formData.paymentMethod,
          amount_paid: parsedAmount,
          promotion: formData.promotion.trim() || null,
          payment_date: formData.paymentDate,
          notes: formData.notes.trim() || null,
        })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.memberPayments.member(member.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        ])
        toast({
          title: 'Payment recorded',
        })
      }

      onOpenChange(false)
    } catch (error) {
      const fallbackMessage = requiresApproval
        ? 'Failed to submit the payment request.'
        : 'Failed to record the payment.'

      toast({
        title: requiresApproval ? 'Request submission failed' : 'Payment failed',
        description: error instanceof Error ? error.message : fallbackMessage,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]" isLoading={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            {requiresApproval
              ? 'Submit a payment record for admin approval and optionally request a membership type change.'
              : 'Record a payment for this member and update their membership type if needed.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <MemberPaymentFields
            amountDirty={amountDirty}
            disabled={isSubmitting}
            formData={formData}
            idPrefix="record-payment"
            isMemberTypesLoading={isMemberTypesLoading}
            memberTypes={memberTypes}
            memberTypesError={memberTypesError instanceof Error ? memberTypesError.message : null}
            setAmountDirty={setAmountDirty}
            setFormData={setFormData}
            showPromotion={!requiresApproval}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              {requiresApproval ? 'Submit Request' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
