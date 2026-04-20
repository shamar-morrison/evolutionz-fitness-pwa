'use client'

import { useEffect, useState } from 'react'
import { Mail, ReceiptText } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  fetchClassRegistrationReceiptPreview,
  formatClassRegistrationReceiptDateValue,
  formatClassRegistrationReceiptTimestampValue,
  sendClassRegistrationReceipt,
  type ClassRegistrationReceiptPreviewResponse,
} from '@/lib/class-registration-receipts'
import { formatOptionalJmd } from '@/lib/classes'
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

type ClassRegistrationReceiptPreviewDialogProps = {
  registrationId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent?: (receiptSentAt: string | null) => void
}

export function ClassRegistrationReceiptPreviewDialog({
  registrationId,
  open,
  onOpenChange,
  onSent,
}: ClassRegistrationReceiptPreviewDialogProps) {
  const [preview, setPreview] = useState<ClassRegistrationReceiptPreviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const canSendCurrentPreview =
    !isSending &&
    preview?.canSend === true &&
    preview?.receipt.registrationId === registrationId

  useEffect(() => {
    const activeRegistrationId = registrationId

    if (!open || !activeRegistrationId) {
      setPreview(null)
      setErrorMessage(null)
      setIsLoading(false)
      setIsSending(false)
      return
    }

    const activeRegistrationIdValue: string = activeRegistrationId
    let isMounted = true

    async function loadPreview() {
      setPreview(null)
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextPreview = await fetchClassRegistrationReceiptPreview(activeRegistrationIdValue)

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
            : 'Failed to load the class registration receipt preview.',
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
  }, [open, registrationId])

  const handleSend = async () => {
    if (!registrationId) {
      return
    }

    setIsSending(true)

    try {
      const response = await sendClassRegistrationReceipt(registrationId)

      if (!response.ok) {
        toast({
          title: 'Receipt send in progress',
          description: response.error,
        })
        return
      }

      onSent?.(response.receiptSentAt)
      toast({
        title: response.alreadySent ? 'Receipt already sent' : 'Receipt sent',
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Receipt send failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to send the class registration receipt.',
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
            Review the class registration receipt before sending it by email.
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
                  <span className="font-medium">Registrant:</span> {preview.receipt.registrantName}
                </p>
                <p>
                  <span className="font-medium">Class:</span> {preview.receipt.className}
                </p>
                <p>
                  <span className="font-medium">Fee Type:</span> {preview.receipt.feeTypeLabel}
                </p>
                <p>
                  <span className="font-medium">Amount Paid:</span>{' '}
                  {formatOptionalJmd(preview.receipt.amountPaid)}
                </p>
                <p>
                  <span className="font-medium">Payment Date:</span>{' '}
                  {formatClassRegistrationReceiptDateValue(preview.receipt.paymentDate)}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-medium">Notes:</span> {preview.receipt.notes ?? 'None'}
                </p>
              </div>
            </div>

            {preview.receiptSentAt ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                Receipt sent on {formatClassRegistrationReceiptTimestampValue(preview.receiptSentAt)}.
              </div>
            ) : null}

            {preview.disabledReason ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {preview.disabledReason}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                Receipt will be delivered to {preview.receipt.recipientEmail}.
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
            disabled={!canSendCurrentPreview}
          >
            <Mail className="h-4 w-4" />
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
