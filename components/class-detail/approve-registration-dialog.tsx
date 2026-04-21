'use client'

import type { Dispatch, SetStateAction } from 'react'
import { ClassRegistrationFeeFields } from '@/components/class-registration-fee-fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  formatClassDate,
  formatClassDateTime,
  type ClassRegistrationFeeType,
  type ClassRegistrationListItem,
  type ClassWithTrainers,
} from '@/lib/classes'

type ApproveRegistrationDialogProps = {
  classItem: ClassWithTrainers
  approveRegistrationItem: ClassRegistrationListItem | null
  setApproveRegistrationItem: Dispatch<SetStateAction<ClassRegistrationListItem | null>>
  approveFeeType: ClassRegistrationFeeType
  setApproveFeeType: Dispatch<SetStateAction<ClassRegistrationFeeType>>
  approveAmount: string
  setApproveAmount: Dispatch<SetStateAction<string>>
  approvePaymentReceived: boolean
  setApprovePaymentReceived: Dispatch<SetStateAction<boolean>>
  approveRegistrationNotes: string
  setApproveRegistrationNotes: Dispatch<SetStateAction<string>>
  approveNote: string
  setApproveNote: Dispatch<SetStateAction<string>>
  isApproving: boolean
  onApprove: () => void | Promise<void>
}

export function ApproveRegistrationDialog({
  classItem,
  approveRegistrationItem,
  setApproveRegistrationItem,
  approveFeeType,
  setApproveFeeType,
  approveAmount,
  setApproveAmount,
  approvePaymentReceived,
  setApprovePaymentReceived,
  approveRegistrationNotes,
  setApproveRegistrationNotes,
  approveNote,
  setApproveNote,
  isApproving,
  onApprove,
}: ApproveRegistrationDialogProps) {
  return (
    <Dialog
      open={Boolean(approveRegistrationItem)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isApproving) {
          return
        }

        if (!nextOpen) {
          setApproveRegistrationItem(null)
          setApproveFeeType('custom')
          setApproveAmount('')
          setApprovePaymentReceived(false)
          setApproveRegistrationNotes('')
          setApproveNote('')
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto"
        isLoading={isApproving}
      >
        <DialogHeader>
          <DialogTitle>Approve Registration</DialogTitle>
          <DialogDescription>
            Confirm the registration details and adjust the fee, payment status, or notes if needed.
          </DialogDescription>
        </DialogHeader>

        {approveRegistrationItem ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Name:</span>{' '}
                  <span className="font-medium">{approveRegistrationItem.registrant_name}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Type:</span>{' '}
                  <span className="font-medium capitalize">
                    {approveRegistrationItem.registrant_type}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">First class date:</span>{' '}
                  <span className="font-medium">
                    {formatClassDate(approveRegistrationItem.month_start)}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Submitted:</span>{' '}
                  <span className="font-medium">
                    {formatClassDateTime(approveRegistrationItem.created_at)}
                  </span>
                </p>
              </div>
            </div>

            <ClassRegistrationFeeFields
              classItem={classItem}
              feeType={approveFeeType}
              customAmount={approveAmount}
              paymentReceived={approvePaymentReceived}
              notes={approveRegistrationNotes}
              onFeeTypeChange={setApproveFeeType}
              onCustomAmountChange={setApproveAmount}
              onPaymentReceivedChange={setApprovePaymentReceived}
              onNotesChange={setApproveRegistrationNotes}
            />

            <div className="space-y-2">
              <Label htmlFor="approve-note">Review note</Label>
              <Textarea
                id="approve-note"
                value={approveNote}
                onChange={(event) => setApproveNote(event.target.value)}
                placeholder="Optional note"
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setApproveRegistrationItem(null)}
            disabled={isApproving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void onApprove()} loading={isApproving}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
