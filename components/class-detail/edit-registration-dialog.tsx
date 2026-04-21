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
import { StringDatePicker } from '@/components/ui/string-date-picker'
import {
  getDefaultClassDateValue,
  type ClassRegistrationFeeType,
  type ClassRegistrationListItem,
  type ClassWithTrainers,
} from '@/lib/classes'

type EditRegistrationDialogProps = {
  classItem: ClassWithTrainers
  canManageClasses: boolean
  editRegistrationItem: ClassRegistrationListItem | null
  setEditRegistrationItem: Dispatch<SetStateAction<ClassRegistrationListItem | null>>
  editPeriodStart: string
  setEditPeriodStart: Dispatch<SetStateAction<string>>
  editFeeType: ClassRegistrationFeeType
  setEditFeeType: Dispatch<SetStateAction<ClassRegistrationFeeType>>
  editAmount: string
  setEditAmount: Dispatch<SetStateAction<string>>
  editPaymentReceived: boolean
  setEditPaymentReceived: Dispatch<SetStateAction<boolean>>
  editRegistrationNotes: string
  setEditRegistrationNotes: Dispatch<SetStateAction<string>>
  isEditingRegistration: boolean
  onSubmit: () => void | Promise<void>
}

export function EditRegistrationDialog({
  classItem,
  canManageClasses,
  editRegistrationItem,
  setEditRegistrationItem,
  editPeriodStart,
  setEditPeriodStart,
  editFeeType,
  setEditFeeType,
  editAmount,
  setEditAmount,
  editPaymentReceived,
  setEditPaymentReceived,
  editRegistrationNotes,
  setEditRegistrationNotes,
  isEditingRegistration,
  onSubmit,
}: EditRegistrationDialogProps) {
  return (
    <Dialog
      open={Boolean(editRegistrationItem)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isEditingRegistration) {
          return
        }

        if (!nextOpen) {
          setEditRegistrationItem(null)
          setEditPeriodStart(getDefaultClassDateValue())
          setEditFeeType('custom')
          setEditAmount('')
          setEditPaymentReceived(false)
          setEditRegistrationNotes('')
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto"
        isLoading={isEditingRegistration}
      >
        <DialogHeader>
          <DialogTitle>
            {canManageClasses ? 'Edit Registration' : 'Request Registration Edit'}
          </DialogTitle>
          <DialogDescription>
            {canManageClasses
              ? 'Update the registration details below.'
              : 'Submit the proposed registration changes for admin approval.'}
          </DialogDescription>
        </DialogHeader>

        {editRegistrationItem ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Name:</span>{' '}
                  <span className="font-medium">{editRegistrationItem.registrant_name}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Type:</span>{' '}
                  <span className="font-medium capitalize">
                    {editRegistrationItem.registrant_type}
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-period-start">Period start</Label>
              <StringDatePicker
                id="edit-period-start"
                value={editPeriodStart}
                onChange={setEditPeriodStart}
                disabled={isEditingRegistration}
              />
            </div>

            <ClassRegistrationFeeFields
              classItem={classItem}
              feeType={editFeeType}
              customAmount={editAmount}
              paymentReceived={editPaymentReceived}
              notes={editRegistrationNotes}
              onFeeTypeChange={setEditFeeType}
              onCustomAmountChange={setEditAmount}
              onPaymentReceivedChange={setEditPaymentReceived}
              onNotesChange={setEditRegistrationNotes}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditRegistrationItem(null)}
            disabled={isEditingRegistration}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSubmit()} loading={isEditingRegistration}>
            {canManageClasses ? 'Save Changes' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
