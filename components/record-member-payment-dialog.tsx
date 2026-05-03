'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Mail, ReceiptText } from 'lucide-react'
import {
  MemberPaymentFields,
  createInitialMemberPaymentFormState,
  type MemberPaymentFormState,
} from '@/components/member-payment-fields'
import { MemberPaymentReceiptPreviewDialog } from '@/components/member-payment-receipt-preview-dialog'
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
import { StringDatePicker } from '@/components/ui/string-date-picker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useCardFeeSettings } from '@/hooks/use-card-fee-settings'
import { useMemberTypes } from '@/hooks/use-member-types'
import { formatCardFeeAmount } from '@/lib/card-fee-settings'
import { toast } from '@/hooks/use-toast'
import {
  getCardFeeAmountInputValue,
  getDefaultMemberPaymentDate,
  MEMBER_PAYMENT_METHOD_OPTIONS,
  recordMemberPayment,
} from '@/lib/member-payments'
import {
  createMemberPaymentRequest,
} from '@/lib/member-payment-requests'
import { queryKeys } from '@/lib/query-keys'
import type {
  Member,
  MemberPaymentMethod,
  MemberPaymentType,
} from '@/types'

type RecordMemberPaymentDialogProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  requiresApproval?: boolean
}

type CardFeeFormState = {
  amount: string
  amountDirty: boolean
  paymentMethod: MemberPaymentMethod | ''
  paymentDate: string
  notes: string
}

type SuccessfulPaymentState = {
  paymentId: string
  receiptNumber: string | null
  paymentType: MemberPaymentType
  receiptSentAt: string | null
}

const EMPTY_PAYMENT_METHOD_VALUE = '__none__'

function createInitialCardFeeFormState(now: Date = new Date()): CardFeeFormState {
  return {
    amount: '',
    amountDirty: false,
    paymentMethod: '',
    paymentDate: getDefaultMemberPaymentDate(now),
    notes: '',
  }
}

export function RecordMemberPaymentDialog({
  member,
  open,
  onOpenChange,
  requiresApproval = false,
}: RecordMemberPaymentDialogProps) {
  const queryClient = useQueryClient()
  const {
    settings: cardFeeSettings,
    isLoading: isCardFeeSettingsLoading,
    error: cardFeeSettingsError,
  } = useCardFeeSettings({
    enabled: open,
  })
  const { memberTypes, isLoading: isMemberTypesLoading, error: memberTypesError } = useMemberTypes({
    enabled: open,
  })
  const [activeTab, setActiveTab] = useState<MemberPaymentType>('membership')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amountDirty, setAmountDirty] = useState(false)
  const [membershipFormData, setMembershipFormData] = useState<MemberPaymentFormState>(() =>
    createInitialMemberPaymentFormState(member.memberTypeId ?? '', memberTypes),
  )
  const [cardFeeFormData, setCardFeeFormData] = useState<CardFeeFormState>(() =>
    createInitialCardFeeFormState(),
  )
  const [successfulPayment, setSuccessfulPayment] = useState<SuccessfulPaymentState | null>(null)
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false)
  const previousOpenRef = useRef(false)
  const previousMemberIdRef = useRef(member.id)
  const memberHasEmail = Boolean(member.email?.trim())
  const cardFeeSettingsErrorMessage =
    cardFeeSettingsError instanceof Error ? cardFeeSettingsError.message : null
  const isCardFeeSettingsUnavailable =
    isCardFeeSettingsLoading || Boolean(cardFeeSettingsErrorMessage) || !cardFeeSettings
  const parsedCardFeeAmount = Number(cardFeeFormData.amount)
  const isCardFeeAmountValid =
    Number.isFinite(parsedCardFeeAmount) &&
    parsedCardFeeAmount > 0 &&
    Number.isInteger(parsedCardFeeAmount)
  const hasResolvedMembershipType = membershipFormData.memberTypeId
    ? memberTypes.some((memberType) => memberType.id === membershipFormData.memberTypeId)
    : false
  const isMembershipDefaultsLoading =
    Boolean(membershipFormData.memberTypeId) &&
    isMemberTypesLoading &&
    !hasResolvedMembershipType

  useEffect(() => {
    const memberChanged = previousMemberIdRef.current !== member.id
    const shouldResetState = open && (!previousOpenRef.current || memberChanged)

    previousOpenRef.current = open
    previousMemberIdRef.current = member.id

    if (!shouldResetState) {
      return
    }

    setActiveTab('membership')
    setMembershipFormData(createInitialMemberPaymentFormState(member.memberTypeId ?? '', memberTypes))
    setCardFeeFormData(createInitialCardFeeFormState())
    setAmountDirty(false)
    setIsSubmitting(false)
    setSuccessfulPayment(null)
    setReceiptPreviewOpen(false)
  }, [member.id, member.memberTypeId, memberTypes, open])

  useEffect(() => {
    if (
      !open ||
      isCardFeeSettingsLoading ||
      cardFeeSettingsErrorMessage ||
      !cardFeeSettings ||
      cardFeeFormData.amountDirty ||
      cardFeeFormData.amount
    ) {
      return
    }

    const nextAmount = getCardFeeAmountInputValue(cardFeeSettings.amountJmd)

    setCardFeeFormData((currentFormData) => {
      if (currentFormData.amountDirty || currentFormData.amount) {
        return currentFormData
      }

      return {
        ...currentFormData,
        amount: nextAmount,
      }
    })
  }, [
    cardFeeFormData.amount,
    cardFeeFormData.amountDirty,
    cardFeeSettings,
    cardFeeSettingsErrorMessage,
    isCardFeeSettingsLoading,
    open,
  ])

  const invalidateDirectPaymentQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPayments.member(member.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPicker.all }),
    ])
  }

  const invalidateRequestQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPaymentRequests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPaymentRequests.pending }),
    ])
  }

  const handleMembershipSubmit = async () => {
    if (!membershipFormData.memberTypeId) {
      toast({
        title: 'Membership type required',
        description: 'Select a membership type before recording the payment.',
        variant: 'destructive',
      })
      return
    }

    if (!membershipFormData.paymentMethod) {
      toast({
        title: 'Payment method required',
        description: 'Select how the payment was collected before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!membershipFormData.paymentDate) {
      toast({
        title: 'Payment date required',
        description: 'Choose the payment date before saving.',
        variant: 'destructive',
      })
      return
    }

    const parsedAmount = Number(membershipFormData.amount)
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

    if (requiresApproval) {
      await createMemberPaymentRequest({
        member_id: member.id,
        payment_type: 'membership',
        amount: parsedAmount,
        payment_method: membershipFormData.paymentMethod,
        payment_date: membershipFormData.paymentDate,
        ...(membershipFormData.memberTypeId ? { member_type_id: membershipFormData.memberTypeId } : {}),
        ...(membershipFormData.notes.trim() ? { notes: membershipFormData.notes.trim() } : {}),
      })
      await invalidateRequestQueries()
      toast({
        title: 'Request submitted',
        description: 'Payment request submitted for admin approval',
      })
      onOpenChange(false)
      return
    }

    const payment = await recordMemberPayment(member.id, {
      payment_type: 'membership',
      member_type_id: membershipFormData.memberTypeId,
      payment_method: membershipFormData.paymentMethod,
      amount_paid: parsedAmount,
      promotion: membershipFormData.promotion.trim() || null,
      payment_date: membershipFormData.paymentDate,
      notes: membershipFormData.notes.trim() || null,
    })
    await invalidateDirectPaymentQueries()
    setSuccessfulPayment({
      paymentId: payment.id,
      receiptNumber: payment.receipt_number,
      paymentType: payment.payment_type,
      receiptSentAt: payment.receipt_sent_at,
    })
  }

  const handleCardFeeSubmit = async () => {
    if (isCardFeeSettingsLoading) {
      toast({
        title: 'Card fee loading',
        description: 'Wait for the configured card fee amount to finish loading.',
        variant: 'destructive',
      })
      return
    }

    if (cardFeeSettingsErrorMessage || !cardFeeSettings) {
      toast({
        title: 'Card fee unavailable',
        description:
          cardFeeSettingsErrorMessage ?? 'The configured card fee amount is unavailable right now.',
        variant: 'destructive',
      })
      return
    }

    if (!cardFeeFormData.paymentMethod) {
      toast({
        title: 'Payment method required',
        description: 'Select how the payment was collected before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!cardFeeFormData.paymentDate) {
      toast({
        title: 'Payment date required',
        description: 'Choose the payment date before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!isCardFeeAmountValid) {
      toast({
        title: 'Invalid card fee amount',
        description: 'Enter a whole-number amount greater than 0.',
        variant: 'destructive',
      })
      return
    }

    if (requiresApproval) {
      await createMemberPaymentRequest({
        member_id: member.id,
        payment_type: 'card_fee',
        amount: parsedCardFeeAmount,
        payment_method: cardFeeFormData.paymentMethod,
        payment_date: cardFeeFormData.paymentDate,
        ...(cardFeeFormData.notes.trim() ? { notes: cardFeeFormData.notes.trim() } : {}),
      })
      await invalidateRequestQueries()
      toast({
        title: 'Request submitted',
        description: 'Payment request submitted for admin approval',
      })
      onOpenChange(false)
      return
    }

    const payment = await recordMemberPayment(member.id, {
      payment_type: 'card_fee',
      payment_method: cardFeeFormData.paymentMethod,
      amount_paid: parsedCardFeeAmount,
      payment_date: cardFeeFormData.paymentDate,
      notes: cardFeeFormData.notes.trim() || null,
    })
    await invalidateDirectPaymentQueries()
    setSuccessfulPayment({
      paymentId: payment.id,
      receiptNumber: payment.receipt_number,
      paymentType: payment.payment_type,
      receiptSentAt: payment.receipt_sent_at,
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!memberHasEmail) {
      toast({
        title: 'Email required',
        description: 'Add an email address to the member profile before recording a payment.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (activeTab === 'membership') {
        await handleMembershipSubmit()
      } else {
        await handleCardFeeSubmit()
      }
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

  const handleReceiptSent = async (receiptSentAt: string | null) => {
    setSuccessfulPayment((currentPayment) =>
      currentPayment
        ? {
            ...currentPayment,
            receiptSentAt,
          }
        : currentPayment,
    )
    await invalidateDirectPaymentQueries()
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !isSubmitting && !receiptPreviewOpen && onOpenChange(nextOpen)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]" isLoading={isSubmitting}>
          <DialogHeader>
            <DialogTitle>
              {successfulPayment ? 'Payment Recorded' : 'Record Payment'}
            </DialogTitle>
            <DialogDescription>
              {successfulPayment
                ? 'The payment was recorded successfully. You can send the receipt now or close this dialog.'
                : requiresApproval
                  ? 'Submit a payment record for admin approval.'
                  : 'Record a payment for this member and send the receipt when ready.'}
            </DialogDescription>
          </DialogHeader>

          {successfulPayment ? (
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <ReceiptText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      {successfulPayment.paymentType === 'card_fee'
                        ? 'Card fee payment recorded.'
                        : 'Membership payment recorded.'}
                    </p>
                    <p className="text-muted-foreground">
                      Receipt number:{' '}
                      {successfulPayment.receiptNumber ?? 'Not available'}
                    </p>
                    {successfulPayment.receiptSentAt ? (
                      <p className="text-muted-foreground">Receipt already sent.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Done
                </Button>
                <Button
                  type="button"
                  onClick={() => setReceiptPreviewOpen(true)}
                  disabled={Boolean(successfulPayment.receiptSentAt)}
                >
                  <Mail className="h-4 w-4" />
                  {successfulPayment.receiptSentAt ? 'Receipt Sent' : 'Send Receipt'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {!memberHasEmail ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <p>
                      Add an email address to this member&apos;s profile before recording a payment.
                    </p>
                  </div>
                </div>
              ) : null}

              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MemberPaymentType)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="membership">Membership</TabsTrigger>
                  <TabsTrigger value="card_fee">Card Fee</TabsTrigger>
                </TabsList>

                <TabsContent value="membership" className="pt-3">
                  <MemberPaymentFields
                    amountDirty={amountDirty}
                    disabled={isSubmitting}
                    formData={membershipFormData}
                    idPrefix="record-payment"
                    isMembershipDefaultsLoading={isMembershipDefaultsLoading}
                    isMemberTypesLoading={isMemberTypesLoading}
                    memberTypes={memberTypes}
                    memberTypesError={memberTypesError instanceof Error ? memberTypesError.message : null}
                    setAmountDirty={setAmountDirty}
                    setFormData={setMembershipFormData}
                    showPromotion={!requiresApproval}
                  />
                </TabsContent>

                <TabsContent value="card_fee" className="pt-3">
                  <div className="grid gap-4">
                    <div className="grid gap-4 items-start sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="record-card-fee-amount">Amount</Label>
                        <Input
                          id="record-card-fee-amount"
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={cardFeeFormData.amount}
                          onChange={(event) =>
                            setCardFeeFormData((currentFormData) => ({
                              ...currentFormData,
                              amount: event.target.value,
                              amountDirty: true,
                            }))
                          }
                          disabled={isSubmitting || isCardFeeSettingsUnavailable}
                        />
                        {isCardFeeSettingsLoading ? (
                          <p className="text-xs text-muted-foreground">
                            Loading configured card fee amount...
                          </p>
                        ) : cardFeeSettingsErrorMessage ? (
                          <p className="text-xs text-destructive">{cardFeeSettingsErrorMessage}</p>
                        ) : cardFeeSettings ? (
                          <p className="text-xs text-muted-foreground">
                            Configured card fee amount: {formatCardFeeAmount(cardFeeSettings.amountJmd)}
                          </p>
                        ) : (
                          <p className="text-xs text-destructive">
                            The configured card fee amount is unavailable right now.
                          </p>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="record-card-fee-payment-method">Payment Method</Label>
                        <Select
                          value={cardFeeFormData.paymentMethod || EMPTY_PAYMENT_METHOD_VALUE}
                          onValueChange={(value) =>
                            setCardFeeFormData((currentFormData) => ({
                              ...currentFormData,
                              paymentMethod:
                                value === EMPTY_PAYMENT_METHOD_VALUE
                                  ? ''
                                  : (value as MemberPaymentMethod),
                            }))
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger id="record-card-fee-payment-method">
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_PAYMENT_METHOD_VALUE}>
                              Select payment method
                            </SelectItem>
                            {MEMBER_PAYMENT_METHOD_OPTIONS.map((paymentMethod) => (
                              <SelectItem key={paymentMethod.value} value={paymentMethod.value}>
                                {paymentMethod.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 items-start sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="record-card-fee-payment-date">Payment Date</Label>
                        <StringDatePicker
                          id="record-card-fee-payment-date"
                          value={cardFeeFormData.paymentDate}
                          onChange={(value) =>
                            setCardFeeFormData((currentFormData) => ({
                              ...currentFormData,
                              paymentDate: value,
                            }))
                          }
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="record-card-fee-notes">Notes</Label>
                        <Textarea
                          id="record-card-fee-notes"
                          rows={3}
                          value={cardFeeFormData.notes}
                          onChange={(event) =>
                            setCardFeeFormData((currentFormData) => ({
                              ...currentFormData,
                              notes: event.target.value,
                            }))
                          }
                          disabled={isSubmitting}
                          placeholder="Optional notes"
                          className="resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

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
                  loading={isSubmitting}
                  disabled={
                    isSubmitting ||
                    !memberHasEmail ||
                    (activeTab === 'membership' && isMembershipDefaultsLoading) ||
                    (activeTab === 'card_fee' &&
                      (isCardFeeSettingsUnavailable || !isCardFeeAmountValid))
                  }
                >
                  {requiresApproval ? 'Submit Request' : 'Record Payment'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <MemberPaymentReceiptPreviewDialog
        memberId={member.id}
        paymentId={successfulPayment?.paymentId ?? null}
        open={receiptPreviewOpen}
        onOpenChange={setReceiptPreviewOpen}
        onSent={(receiptSentAt) => {
          void handleReceiptSent(receiptSentAt)
        }}
      />
    </>
  )
}
