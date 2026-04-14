'use client'

import { useEffect, useState } from 'react'
import { Mail, ReceiptText } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  fetchMemberPaymentReceiptPreview,
  formatMemberPaymentMethodLabel,
  formatReceiptDateValue,
  formatReceiptTimestampValue,
  sendMemberPaymentReceipt,
  type MemberPaymentReceiptPreviewResponse,
} from '@/lib/member-payment-receipts'
import { formatJmdCurrency } from '@/lib/pt-scheduling'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

type MemberPaymentReceiptPreviewDialogProps = {
  memberId: string
  paymentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent?: (receiptSentAt: string | null) => void
}

export function MemberPaymentReceiptPreviewDialog({
  memberId,
  paymentId,
  open,
  onOpenChange,
  onSent,
}: MemberPaymentReceiptPreviewDialogProps) {
  const [preview, setPreview] = useState<MemberPaymentReceiptPreviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const activePaymentId = paymentId

    if (!open || !activePaymentId) {
      setPreview(null)
      setErrorMessage(null)
      setIsLoading(false)
      setIsSending(false)
      return
    }

    const activePaymentIdValue: string = activePaymentId
    let isMounted = true

    async function loadPreview() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextPreview = await fetchMemberPaymentReceiptPreview(memberId, activePaymentIdValue)

        if (!isMounted) {
          return
        }

        setPreview(nextPreview)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Failed to load the payment receipt preview.',
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadPreview()

    return () => {
      isMounted = false
    }
  }, [memberId, open, paymentId])

  const handleSend = async () => {
    if (!paymentId) {
      return
    }

    setIsSending(true)

    try {
      const response = await sendMemberPaymentReceipt(memberId, paymentId)
      onSent?.(response.receiptSentAt)
      toast({
        title: response.alreadySent ? 'Receipt already sent' : 'Receipt sent',
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Receipt send failed',
        description:
          error instanceof Error ? error.message : 'Failed to send the payment receipt.',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSending && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]" isLoading={isSending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Receipt Preview
          </DialogTitle>
          <DialogDescription>
            Review the receipt before sending it to the member.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : preview ? (
          <div className="space-y-6">
            <div className="space-y-1 rounded-lg border bg-muted/30 p-4">
              <h3 className="text-lg font-semibold">{preview.receipt.gymName}</h3>
              <p className="text-sm text-muted-foreground">{preview.receipt.gymAddress}</p>
              <p className="text-sm text-muted-foreground">{preview.receipt.gymContact}</p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-medium">Receipt Number:</span>{' '}
                  {preview.receipt.receiptNumber ?? 'Not available'}
                </p>
                <p>
                  <span className="font-medium">Recipient:</span>{' '}
                  {preview.receipt.recipientEmail ?? 'No email on file'}
                </p>
                <p>
                  <span className="font-medium">Member Name:</span> {preview.receipt.memberName}
                </p>
                <p>
                  <span className="font-medium">Payment Date:</span>{' '}
                  {formatReceiptDateValue(preview.receipt.paymentDate)}
                </p>
                <p>
                  <span className="font-medium">Membership Start:</span>{' '}
                  {formatReceiptTimestampValue(preview.receipt.membershipBeginTime)}
                </p>
                <p>
                  <span className="font-medium">Membership End:</span>{' '}
                  {formatReceiptTimestampValue(preview.receipt.membershipEndTime)}
                </p>
                <p>
                  <span className="font-medium">Payment Type:</span>{' '}
                  {preview.receipt.paymentLabel}
                </p>
                <p>
                  <span className="font-medium">Amount Paid:</span>{' '}
                  {formatJmdCurrency(preview.receipt.amountPaid)}
                </p>
                <p>
                  <span className="font-medium">Payment Method:</span>{' '}
                  {formatMemberPaymentMethodLabel(preview.receipt.paymentMethod)}
                </p>
                <p>
                  <span className="font-medium">Recorded By:</span>{' '}
                  {preview.receipt.recordedByName ?? 'Unknown'}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-medium">Notes:</span> {preview.receipt.notes ?? 'None'}
                </p>
              </div>
            </div>

            {preview.receiptSentAt ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                Receipt sent on {formatReceiptTimestampValue(preview.receiptSentAt)}.
              </div>
            ) : null}

            {preview.disabledReason ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {preview.disabledReason}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                Thank you for training with {preview.receipt.gymName}.
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={() => void handleSend()}
            loading={isSending}
            disabled={isSending || !preview?.canSend}
          >
            <Mail className="h-4 w-4" />
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
