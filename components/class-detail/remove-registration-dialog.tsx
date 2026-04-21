'use client'

import type { Dispatch, SetStateAction } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatOptionalJmd, type ClassRegistrationListItem } from '@/lib/classes'

type RemoveRegistrationDialogProps = {
  canManageClasses: boolean
  removeRegistrationItem: ClassRegistrationListItem | null
  setRemoveRegistrationItem: Dispatch<SetStateAction<ClassRegistrationListItem | null>>
  isRemovingRegistration: boolean
  onConfirm: () => void | Promise<void>
}

export function RemoveRegistrationDialog({
  canManageClasses,
  removeRegistrationItem,
  setRemoveRegistrationItem,
  isRemovingRegistration,
  onConfirm,
}: RemoveRegistrationDialogProps) {
  return (
    <ConfirmDialog
      open={Boolean(removeRegistrationItem)}
      onOpenChange={(open) => {
        if (!open) {
          setRemoveRegistrationItem(null)
        }
      }}
      title={canManageClasses ? 'Remove registration?' : 'Request registration removal?'}
      description={
        removeRegistrationItem
          ? removeRegistrationItem.amount_paid > 0
            ? `Removing this registration will reverse the recorded payment of ${formatOptionalJmd(removeRegistrationItem.amount_paid)}. This action cannot be undone.`
            : 'This registration has no recorded payment. This action cannot be undone.'
          : 'This action cannot be undone.'
      }
      confirmLabel={canManageClasses ? 'Remove Registration' : 'Submit Request'}
      cancelLabel="Cancel"
      onConfirm={() => void onConfirm()}
      onCancel={() => setRemoveRegistrationItem(null)}
      variant="destructive"
      isLoading={isRemovingRegistration}
    />
  )
}
